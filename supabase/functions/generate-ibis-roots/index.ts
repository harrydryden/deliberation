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

    if (templateError) {
      console.error('Template fetch error:', templateError);
      throw new Error(`Failed to fetch template: ${templateError.message}`);
    }

    if (templateData && templateData.length > 0) {
      console.log('Using database template');
      let template = templateData[0].template_text;
      
      // Replace template variables with actual values
      template = template
        .replace(/\{\{deliberation_title\}\}/g, deliberationTitle)
        .replace(/\{\{deliberation_description\}\}/g, deliberationDescription || 'No description provided');
      
      // Handle conditional notion context (Handlebars-style)
      if (notion) {
        template = template
          .replace(/\{\{#notion_context\}\}/g, '')
          .replace(/\{\{\/notion_context\}\}/g, '')
          .replace(/\{\{notion_context\}\}/g, notion);
      } else {
        // Remove conditional section if no notion provided
        template = template.replace(/\{\{#notion_context\}\}.*?\{\{\/notion_context\}\}/gs, '');
      }
      
      return template;
    } else {
      throw new Error('No template found in database');
    }
  } catch (error) {
    console.error('Failed to fetch IBIS generation prompt template:', error);
    throw error; // Don't use fallback - throw the actual error
  }
}

// Fallback prompt if template fetch fails
function getFallbackPrompt(deliberationTitle: string, deliberationDescription: string, notion: string): string {
  return `You are an expert facilitator helping to identify specific, actionable root issues for the deliberation topic "${deliberationTitle}".

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
}

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('Starting generate-ibis-roots function');
    
    // Read and parse request body directly
    const rawBody = await req.text();
    console.log('Raw request body:', rawBody);
    console.log('Raw body length:', rawBody.length);
    
    let requestData;
    try {
      requestData = JSON.parse(rawBody);
      console.log('Parsed request data:', requestData);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return createErrorResponse(new Error('Invalid JSON in request body'), 400, 'generate-ibis-roots');
    }
    
    const { deliberationId, deliberationTitle, deliberationDescription, notion } = requestData;
    
    if (!deliberationId || !deliberationTitle) {
      console.error('Missing required fields:', { deliberationId: !!deliberationId, deliberationTitle: !!deliberationTitle });
      return createErrorResponse(new Error('Missing required fields: deliberationId, deliberationTitle'), 400, 'generate-ibis-roots');
    }
    
    console.log('Request validated successfully', { deliberationId, deliberationTitle });

    // Get environment and clients with caching
    console.log('Validating environment...');
    let supabase, openAIApiKey;
    try {
      const env = validateAndGetEnvironment();
      supabase = env.supabase;
      console.log('Supabase client initialized');
    } catch (envError) {
      console.error('Environment validation failed:', envError);
      return createErrorResponse(envError, 500, 'generate-ibis-roots');
    }
    
    try {
      openAIApiKey = getOpenAIKey();
      console.log('OpenAI API key retrieved');
    } catch (keyError) {
      console.error('OpenAI key retrieval failed:', keyError);
      return createErrorResponse(keyError, 500, 'generate-ibis-roots');
    }

    // Get IBIS generation prompt from template system
    console.log('Fetching template...');
    let prompt;
    try {
      prompt = await getIbisGenerationPrompt(supabase, deliberationTitle, deliberationDescription, notion);
      console.log('Template fetched successfully, prompt length:', prompt.length);
    } catch (templateError) {
      console.error('Template fetch failed:', templateError);
      return createErrorResponse(templateError, 500, 'generate-ibis-roots');
    }
    
    console.log('Final prompt being sent to AI:', prompt);

    // Call OpenAI API with error handling
    console.log('Making OpenAI API call...');
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

    console.log('OpenAI response status:', openaiResponse.status);
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    const aiResponse = openaiData.choices[0].message.content;
    console.log('OpenAI response received successfully');

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
    console.log(`Creating ${suggestedIssues.length} IBIS nodes...`);
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