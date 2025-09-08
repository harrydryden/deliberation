import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import shared utilities for performance and consistency
import { 
  corsHeaders, 
  validateAndGetEnvironment,
  createErrorResponse,
  createSuccessResponse,
  handleCORSPreflight,
  getOpenAIKey,
  parseAndValidateRequest
} from '../shared/edge-function-utils.ts';
import { configCache, createCacheKey } from '../shared/cache-manager.ts';
import { EdgeLogger, withTimeout, withRetry } from '../shared/edge-logger.ts';

// Helper function to get classification prompt from template system
async function getClassificationPrompt(supabase: any, content: string, deliberationContext: string, deliberationNotion: string): Promise<string> {
  try {
    // Try to get classification_prompt template
    const { data: template } = await supabase
      .from('prompt_templates')
      .select('template')
      .eq('prompt_type', 'classification_prompt')
      .eq('is_active', true)
      .eq('is_default', true)
      .single()

    if (template && template.template) {
      // Replace template variables
      return template.template
        .replace('{content}', content)
        .replace('{deliberationContext}', deliberationContext)
        .replace('{deliberationNotion}', deliberationNotion)
    }
  } catch (error) {
    EdgeLogger.error('Failed to fetch classification prompt template', error);
    throw new Error('Classification prompt template not available');
  }
}

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    const { content, deliberationId } = await parseAndValidateRequest(req, ['content']);

    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();
    const openAIApiKey = getOpenAIKey();

    // Fetch deliberation context if deliberationId is provided
    let deliberationContext = '';
    let deliberationNotion = '';
    let hasExistingNodes = true;
    
    if (deliberationId) {
      const { data: deliberation } = await supabase
        .from('deliberations')
        .select('title, description, notion')
        .eq('id', deliberationId)
        .maybeSingle();
      
      // Check if there are existing IBIS nodes
      const { data: existingNodes } = await supabase
        .from('ibis_nodes')
        .select('id')
        .eq('deliberation_id', deliberationId)
        .limit(1);
        
      hasExistingNodes = existingNodes && existingNodes.length > 0;
      
      if (deliberation) {
        deliberationContext = `\n\nDeliberation: "${deliberation.title}"\nDescription: ${deliberation.description || 'No description provided'}`;
        deliberationNotion = deliberation.notion || '';
      }
    }

    const prompt = await getClassificationPrompt(supabase, content, deliberationContext, deliberationNotion);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages: [
          { 
            role: 'system', 
            content: 'You are an AI that classifies messages for democratic deliberation. Respond only with valid JSON.' 
          },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const result = data.choices[0].message.content;

    try {
      const parsedResult = JSON.parse(result);
      
      // Validate the parsed result has required fields
      const requiredFields = ['title', 'keywords', 'nodeType', 'confidence', 'description', 'stanceScore'];
      const missingFields = requiredFields.filter(field => !(field in parsedResult));
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields in classification result: ${missingFields.join(', ')}`);
      }
      
      return createSuccessResponse({
        ...parsedResult,
        hasExistingNodes,
        deliberationNotion
      });
      
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Raw result:', result);
      throw new Error('Failed to parse classification result as JSON');
    }

  } catch (error) {
    console.error('Classification error:', error);
    return createErrorResponse(error, 500, 'message classification');
  }
});