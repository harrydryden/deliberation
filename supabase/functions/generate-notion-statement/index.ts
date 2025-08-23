import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, description } = await req.json();

    if (!title) {
      throw new Error('Title is required');
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Generating notion statement for:', { title, description });

    const systemPrompt = `You are an expert in deliberation and democratic discourse. Your task is to generate a clear, actionable notion statement that will help structure a deliberation.

A good notion statement:
- Uses stance language (should, must, ought, need to, required, necessary, appropriate)
- Is specific and actionable
- Frames the key decision or position to be deliberated
- Is neutral but clear about what's being considered
- Must be between 150-240 characters long
- Should be clear and comprehensive while staying within the character limit

Generate a notion statement based on the deliberation title and description provided.`;

    const userPrompt = `Title: ${title}
${description ? `Description: ${description}` : ''}

Generate a single, clear notion statement for this deliberation (150-240 characters):`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 150,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedNotion = data.choices[0].message.content.trim();

    console.log('Generated notion statement:', generatedNotion);

    return new Response(JSON.stringify({ notion: generatedNotion }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-notion-statement function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});