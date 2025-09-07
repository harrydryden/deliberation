import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';
import { ModelConfigManager } from '../shared/model-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to get IBIS generation prompt from template system
async function getIbisGenerationPrompt(supabase: any, deliberationTitle: string, deliberationDescription: string, notion: string): Promise<string> {
  try {
    console.log('Fetching ibis_generation_prompt template...');
    // Try to get ibis_generation_prompt template
    const { data: template, error } = await supabase
      .from('prompt_templates')
      .select('template')
      .eq('prompt_type', 'ibis_generation_prompt')
      .eq('is_active', true)
      .eq('is_default', true)
      .single()

    console.log('Template fetch result:', { template, error });

    if (template && template.template) {
      console.log('Using database template');
      // Replace template variables
      return template.template
        .replace('{deliberationTitle}', deliberationTitle)
        .replace('{deliberationDescription}', deliberationDescription || 'No description provided')
        .replace('{notion}', notion ? `Notion for stance scoring: ${notion}` : '')
    }
  } catch (error) {
    console.log('Failed to fetch IBIS generation prompt template:', error)
  }

  console.log('Using enhanced fallback prompt');
  // Enhanced fallback prompt with topic-specific guidance
  return `You are an expert facilitator helping to identify specific, actionable root issues for the deliberation topic "${deliberationTitle}".

DELIBERATION CONTEXT:
Title: "${deliberationTitle}"
Description: "${deliberationDescription || 'No description provided'}"
${notion ? `Stance Scoring Notion: "${notion}"` : ''}

CRITICAL REQUIREMENTS:
1. Issues must be DIRECTLY RELATED to "${deliberationTitle}" - not abstract concepts
2. Issues must be SPECIFIC policy/implementation questions within this topic
3. Issues must be ACTIONABLE - participants can take clear positions 
4. Issues must address CORE DILEMMAS or decisions needed for this specific topic
5. Issues should reference concrete aspects mentioned in the description above

EXAMPLES for "${deliberationTitle}":
${deliberationTitle.toLowerCase().includes('assisted dying') ? 
  '- GOOD: "Should safeguards require multiple doctor assessments?", "What eligibility criteria should apply?"' +
  '\n- BAD: "What is the meaning of life?", "Should we value individual rights?"' :
  '- GOOD: Specific implementation questions, eligibility criteria, policy mechanisms' +
  '\n- BAD: Abstract philosophical concepts, unrelated broad themes'
}

Generate 3-5 issues that directly address decision points participants need to resolve about "${deliberationTitle}".

Respond with ONLY a valid JSON array:
[
  {
    "title": "Specific decision question about ${deliberationTitle} (max 80 chars)",
    "description": "Why this specific aspect of ${deliberationTitle} needs resolution (max 250 chars)"
  }
]`;
}

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

    // Get IBIS generation prompt from template system
    const prompt = await getIbisGenerationPrompt(supabase, deliberationTitle, deliberationDescription, notion);
    
    console.log('Final prompt being sent to AI:', prompt);

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
            role: 'system',
            content: 'You are an expert facilitator specialising in democratic deliberation. You must respond with ONLY a valid JSON array, no additional text or formatting. Each object must have exactly "title" and "description" fields. Focus on specific, actionable issues directly related to the deliberation topic. Use British English spelling and grammar throughout.'
          },
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
      console.log('Raw AI Response:', aiResponse);
      console.log('AI Response type:', typeof aiResponse);
      console.log('AI Response length:', aiResponse?.length);
      
      // First try to parse the entire response as JSON
      try {
        suggestedIssues = JSON.parse(aiResponse);
      } catch (directParseError) {
        console.log('Direct JSON parse failed, trying to extract JSON array');
        // Extract JSON from the response if it's wrapped in text
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.error('No JSON array found in AI response:', aiResponse);
          throw new Error('No JSON array found in AI response');
        }
        console.log('Extracted JSON string:', jsonMatch[0]);
        suggestedIssues = JSON.parse(jsonMatch[0]);
      }
      
      console.log('Parsed suggested issues:', JSON.stringify(suggestedIssues, null, 2));
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      console.error('Parse error details:', parseError);
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