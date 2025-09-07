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
    console.log('Failed to fetch classification prompt template:', error);
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

    // Get classification prompt from template system
    const prompt = await getClassificationPrompt(supabase, content, deliberationContext, deliberationNotion)

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        ...ModelConfigManager.generateAPIParams('gpt-5-2025-08-07', [{
          role: 'user',
          content: prompt
        }], { maxTokens: 1000 })
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI API error:', errorText)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const openaiData = await response.json()
    const aiResponse = openaiData.choices[0].message.content

    console.log('AI Response:', aiResponse)

    // Parse the JSON response
    let classification
    try {
      console.log('Raw AI Response:', aiResponse)
      console.log('AI Response type:', typeof aiResponse)
      console.log('AI Response length:', aiResponse?.length)
      
      classification = JSON.parse(aiResponse)
      console.log('Parsed classification:', JSON.stringify(classification, null, 2))
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse)
      console.error('Parse error details:', parseError)
      throw new Error('Invalid AI response format')
    }

    // Map old response format to new format if needed
    if (classification.item_type && !classification.nodeType) {
      console.log('Mapping item_type to nodeType:', classification.item_type)
      // Map item_type values to nodeType values
      const typeMapping = {
        'proposal': 'position',
        'question': 'issue', 
        'statement': 'argument',
        'issue': 'issue',
        'position': 'position',
        'argument': 'argument'
      }
      classification.nodeType = typeMapping[classification.item_type] || 'issue'
    }

    // Map confidence_score to confidence if needed
    if (classification.confidence_score && !classification.confidence) {
      classification.confidence = classification.confidence_score
    }

    // Map stance_score to stanceScore if needed
    if (classification.stance_score && !classification.stanceScore) {
      classification.stanceScore = classification.stance_score
    }

    // Validate the response structure
    console.log('Final classification before validation:', JSON.stringify(classification, null, 2))
    console.log('Validation checks:', {
      hasTitle: !!classification.title,
      hasKeywords: !!classification.keywords,
      hasNodeType: !!classification.nodeType,
      hasConfidence: !!classification.confidence
    })
    
    if (!classification.title || !classification.keywords || !classification.nodeType || !classification.confidence) {
      console.error('Incomplete classification response:', classification)
      throw new Error('Incomplete classification response')
    }

    // Validate stance score if present
    if (classification.stanceScore !== undefined && (classification.stanceScore < -1 || classification.stanceScore > 1)) {
      console.warn('Stance score out of range, clamping to [-1, 1]')
      classification.stanceScore = Math.max(-1, Math.min(1, classification.stanceScore))
    }

    // Store or update keywords in the database
    const keywordIds = []
    for (const keyword of classification.keywords) {
      // Try to find existing keyword
      const { data: existingKeyword, error: selectError } = await supabase
        .from('keywords')
        .select('id')
        .eq('keyword', keyword.toLowerCase())
        .single()

      if (existingKeyword) {
        keywordIds.push(existingKeyword.id)
        // Get current usage count and increment it
        const { data: currentKeyword } = await supabase
          .from('keywords')
          .select('usage_count')
          .eq('id', existingKeyword.id)
          .single()
        
        const newUsageCount = (currentKeyword?.usage_count || 0) + 1
        await supabase
          .from('keywords')
          .update({ usage_count: newUsageCount })
          .eq('id', existingKeyword.id)
      } else {
        // Create new keyword
        const { data: newKeyword, error: insertError } = await supabase
          .from('keywords')
          .insert({
            keyword: keyword.toLowerCase(),
            category: 'deliberation',
            usage_count: 1
          })
          .select('id')
          .single()

        if (newKeyword) {
          keywordIds.push(newKeyword.id)
        }
      }
    }

    // If no IBIS nodes exist yet, suggest generating root issues
    let rootSuggestion = null
    if (!hasExistingNodes) {
      rootSuggestion = {
        message: "This deliberation has no IBIS nodes yet. Consider generating initial root issues to structure the discussion.",
        action: "generateRootIssues"
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        classification: {
          ...classification,
          keywordIds
        },
        rootSuggestion
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in classify-message function:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})