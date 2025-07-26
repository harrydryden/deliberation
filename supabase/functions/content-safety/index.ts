import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = "claude-3-5-sonnet-20241022";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, responseType, agentType } = await req.json();
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log('Content safety check for:', { agentType, responseType, contentLength: content.length });

    // Check content safety
    const safetyResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 50,
        temperature: 0,
        messages: [{
          role: "user",
          content: `Is this content safe for public discussion? Check for harm, bias, manipulation:

"${content}"

Respond with only: SAFE or UNSAFE`
        }]
      })
    });

    if (!safetyResponse.ok) {
      throw new Error(`Safety check failed: ${safetyResponse.status}`);
    }

    const safetyData = await safetyResponse.json();
    const isSafe = safetyData.content[0].text.trim() === 'SAFE';

    let finalContent = content;

    // If content is unsafe, sanitize it
    if (!isSafe) {
      console.log('Content flagged as unsafe, sanitizing...');
      
      const sanitizeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 300,
          temperature: 0.5,
          messages: [{
            role: "user",
            content: `Rewrite this to be constructive and appropriate:

"${content}"

Maintain the core perspective but remove any harmful elements.`
          }]
        })
      });

      if (sanitizeResponse.ok) {
        const sanitizeData = await sanitizeResponse.json();
        finalContent = sanitizeData.content[0].text.trim();
      }
    }

    // Apply appropriate framing for peer responses
    if (agentType === 'peer_agent' && responseType) {
      const frames: Record<string, string> = {
        supportive: "Another participant shared a similar perspective: ",
        counter: "Another participant offered this alternative view: ",
        community_perspective: "From the community discussions: "
      };
      
      if (frames[responseType]) {
        finalContent = frames[responseType] + finalContent;
      }
    }

    // Add metadata
    const response = {
      content: finalContent,
      metadata: {
        generatedAt: new Date().toISOString(),
        modelUsed: MODEL,
        safetyChecked: true,
        wasSanitized: !isSafe,
        agentType,
        responseType
      }
    };

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Content safety error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});