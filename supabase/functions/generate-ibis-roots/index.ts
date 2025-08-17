import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deliberationId, deliberationTitle, deliberationDescription, notion } = await req.json();

    if (!deliberationId || !deliberationTitle) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Construct prompt for generating root issues
    const prompt = `You are an expert facilitator helping to identify key issues for a democratic deliberation process using the IBIS (Issue-Based Information System) framework.

Given the following deliberation details:
Title: ${deliberationTitle}
Description: ${deliberationDescription || 'No description provided'}
${notion ? `Notion for stance scoring: ${notion}` : ''}

Please identify 3-5 key root issues that participants should deliberate on. These should be:
1. Central questions or problems that need to be addressed
2. Broad enough to generate meaningful discussion
3. Specific enough to be actionable
4. Relevant to the deliberation topic

For each issue, provide:
- A clear, concise title (max 100 characters)
- A brief description explaining why this is important (max 300 characters)

Respond with a JSON array in this exact format:
[
  {
    "title": "Issue title here",
    "description": "Brief description of why this issue is important"
  }
]`;

    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        max_completion_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${openaiResponse.statusText}`);
    }

    const openaiData = await openaiResponse.json();
    const aiResponse = openaiData.choices[0].message.content;

    // Parse AI response
    let suggestedIssues;
    try {
      // Extract JSON from the response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in AI response');
      }
      suggestedIssues = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Validate the response structure
    if (!Array.isArray(suggestedIssues)) {
      throw new Error('AI response is not an array');
    }

    // Create IBIS nodes for each suggested issue
    const createdNodes = [];
    for (const issue of suggestedIssues) {
      if (!issue.title || !issue.description) {
        console.warn('Skipping invalid issue:', issue);
        continue;
      }

      const { data: node, error } = await supabase
        .from('ibis_nodes')
        .insert({
          deliberation_id: deliberationId,
          node_type: 'issue',
          title: issue.title.substring(0, 100), // Ensure title length limit
          description: issue.description.substring(0, 300), // Ensure description length limit
          created_by: null, // AI-generated, no specific user
          position_x: Math.random() * 400, // Random positioning for now
          position_y: Math.random() * 300
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating IBIS node:', error);
        continue;
      }

      createdNodes.push(node);
    }

    console.log(`Generated ${createdNodes.length} root issues for deliberation ${deliberationId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        nodes: createdNodes,
        count: createdNodes.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-ibis-roots function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});