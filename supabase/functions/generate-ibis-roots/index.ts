import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import shared utilities for performance and consistency
import { 
  corsHeaders, 
  validateAndGetEnvironment, 
  createErrorResponse, 
  createSuccessResponse,
  handleCORSPreflight,
  parseAndValidateRequest,
  getOpenAIKey
} from '../shared/edge-function-utils.ts';
import { ModelConfigManager } from '../shared/model-config.ts';
import { EdgeLogger, withTimeout, withRetry } from '../shared/edge-logger.ts';

// Helper function to get system message from template
async function getSystemMessage(supabase: any, templateName: string): Promise<string> {
  try {
    const { data: templateData, error } = await supabase
      .rpc('get_prompt_template', { template_name: templateName });

    if (templateData && templateData.length > 0) {
      return templateData[0].template_text;
    }
  } catch (error) {
    EdgeLogger.error(`Failed to fetch ${templateName} template`, error);
  }
  
  // Fallbacks based on template name
  const fallbacks = {
    'ibis_relationship_system_message': 'You are an expert in argument analysis and democratic deliberation. Analyse logical relationships between contributions accurately. Use British English spelling and grammar in all responses.',
    'issue_recommendation_system_message': 'You are an expert at analysing content and finding relevant issues in deliberative discussions. Always respond with valid JSON. Use British English spelling and grammar throughout.',
    'ibis_root_generation_system_message': 'You are an expert facilitator specialising in democratic deliberation. You must respond with ONLY a valid JSON array, no additional text or formatting. Each object must have exactly "title" and "description" fields. Focus on specific, actionable issues directly related to the deliberation topic. Use British English spelling and grammar throughout.'
  };
  
  return fallbacks[templateName as keyof typeof fallbacks] || 'You are a helpful AI assistant specialising in democratic deliberation. Use British English spelling and grammar throughout.';
}


// Helper function to get IBIS generation prompt from template system
async function getIbisGenerationPrompt(supabase: any, deliberationTitle: string, deliberationDescription: string, notion: string): Promise<string> {
  try {
    EdgeLogger.debug('Fetching generate_ibis_roots template');
    // Get template using correct column names
    const { data: templateData, error: templateError } = await supabase
      .rpc('get_prompt_template', { 
        template_name: 'generate_ibis_roots'
      });

    EdgeLogger.debug('Template fetch result', { templateData: !!templateData, templateError });

    if (templateData && templateData.length > 0) {
      console.log('Using database template');
      const template = templateData[0];
      
      // Replace template variables with actual values
      return template.template_text
        .replace(/\{\{deliberation_title\}\}/g, deliberationTitle)
        .replace(/\{\{deliberation_description\}\}/g, deliberationDescription || 'No description provided')
        .replace(/\{\{notion_context\}\}/g, notion || 'No notion statement provided');
    }
  } catch (error) {
    console.log('Failed to fetch IBIS generation prompt template:', error);
    throw new Error('IBIS generation prompt template not available');
  }
}

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    const { deliberationId, deliberationTitle, deliberationDescription, notion } = await parseAndValidateRequest(req, ['deliberationId', 'deliberationTitle']);

    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();
    const openAIApiKey = getOpenAIKey();

    // Get IBIS generation prompt from template system
    const prompt = await getIbisGenerationPrompt(supabase, deliberationTitle, deliberationDescription, notion);
    
    console.log('Final prompt being sent to AI:', prompt);

    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        max_completion_tokens: 1000,
        messages: [
          {
            role: 'system',
            content: await getSystemMessage(supabase, 'ibis_root_generation_system_message')
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

    return createSuccessResponse({ 
      success: true, 
      nodes: createdNodes,
      count: createdNodes.length 
    });

  } catch (error) {
    console.error('Error in generate-ibis-roots function:', error);
    return createErrorResponse(error, 500, 'generate-ibis-roots');
  }
});