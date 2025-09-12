import "xhr";
import { serve } from "std/http/server.ts";

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


serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    const { title, description } = await parseAndValidateRequest(req, ['title']);

    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();
    const openAIApiKey = getOpenAIKey();

    EdgeLogger.debug('Generating notion statement for', { title, description });

    // Get notion statement prompt from template system

    const { data: templateData, error: templateError } = await supabase
      .rpc('get_prompt_template', { 
        template_name: 'generate_notion_statement'
      });

    if (templateError || !templateData || templateData.length === 0) {
      throw new Error(`Failed to get prompt template: ${templateError?.message || 'Template not found'}`);
    }

    const template = templateData[0];
    
    // Replace template variables with actual values
    const descriptionText = description ? `Description: ${description}` : '';
    const combinedPrompt = template.template_text
      .replace(/\{\{title\}\}/g, title)
      .replace(/\{\{description\}\}/g, descriptionText);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...ModelConfigManager.generateAPIParams('gpt-5-2025-08-07', [
          { role: 'user', content: combinedPrompt }
        ])
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

    return createSuccessResponse({ notion: generatedNotion });
  } catch (error) {
    console.error('Error in generate-notion-statement function:', error);
    return createErrorResponse(error, 500, 'generate-notion-statement');
  }
});