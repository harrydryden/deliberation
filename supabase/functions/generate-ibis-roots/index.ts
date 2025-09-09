import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

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
    console.log('🚀 Starting generate-ibis-roots function - BASIC TEST');
    
    // Parse request body
    let requestData;
    try {
      requestData = await req.json();
      console.log('📝 Request data received:', JSON.stringify(requestData, null, 2));
    } catch (jsonError) {
      console.error('❌ Failed to parse request JSON:', jsonError);
      throw new Error(`Invalid JSON in request: ${jsonError.message}`);
    }

    const { deliberationId, deliberationTitle, deliberationDescription, notion } = requestData;
    
    if (!deliberationId || !deliberationTitle) {
      throw new Error('Missing required fields: deliberationId and deliberationTitle');
    }

    console.log('✅ Request validation passed');

    // Test environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    console.log('🔧 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseServiceKey,
      hasOpenAIKey: !!openaiApiKey
    });

    if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
      throw new Error('Missing required environment variables');
    }

    console.log('✅ Environment variables validated');

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('✅ Supabase client created');

    // Create prompt for OpenAI
    const prompt = `You are an expert facilitator helping to identify specific, actionable root issues for the deliberation topic "${deliberationTitle}".

DELIBERATION CONTEXT:
Title: "${deliberationTitle}"
Description: "${deliberationDescription || 'No description provided'}"
${notion ? `Stance Scoring Notion: "${notion}"` : ''}

Generate 3-5 specific issues that participants need to resolve about "${deliberationTitle}".

Respond with ONLY a valid JSON array:
[
  {
    "title": "Specific decision question (max 80 chars)",
    "description": "Why this needs resolution (max 250 chars)"
  }
]`;

    console.log('📋 Generated prompt (first 200 chars):', prompt.substring(0, 200));

    // Call OpenAI API
    console.log('🤖 Making OpenAI API call...');
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
            content: 'You are an expert in argument analysis and democratic deliberation. You must respond with ONLY a valid JSON array, no additional text or formatting. Use British English spelling and grammar throughout.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    console.log('📡 OpenAI response status:', openaiResponse.status);

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('❌ OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    const aiResponse = openaiData.choices[0].message.content;
    console.log('🎯 AI response received, length:', aiResponse?.length);
    console.log('📝 Raw AI Response:', aiResponse);

    // Parse AI response
    let suggestedIssues;
    try {
      // Try to parse directly first
      try {
        suggestedIssues = JSON.parse(aiResponse);
      } catch (directParseError) {
        console.log('🔍 Direct parse failed, extracting JSON array...');
        // Extract JSON from the response if it's wrapped in text
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          throw new Error('No JSON array found in AI response');
        }
        suggestedIssues = JSON.parse(jsonMatch[0]);
      }
      
      console.log('✅ Parsed suggested issues:', JSON.stringify(suggestedIssues, null, 2));
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Validate the response structure
    if (!Array.isArray(suggestedIssues)) {
      throw new Error('AI response is not an array');
    }

    // Create IBIS nodes for each suggested issue
    const createdNodes = [];
    console.log(`🏗️ Creating ${suggestedIssues.length} IBIS nodes...`);
    
    for (const issue of suggestedIssues) {
      if (!issue.title || !issue.description) {
        console.warn('⚠️ Skipping invalid issue:', issue);
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
        console.error('❌ Error creating IBIS node:', error);
        continue;
      }

      console.log('✅ Created IBIS node:', node.id);
      createdNodes.push(node);
    }

    console.log(`🎉 Successfully generated ${createdNodes.length} root issues`);

    return new Response(JSON.stringify({ 
      success: true, 
      nodes: createdNodes,
      count: createdNodes.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in generate-ibis-roots function:', error);
    console.error('💥 Error stack:', error.stack);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});