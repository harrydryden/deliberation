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
} from '../shared/edge-function-utils';
import { ModelConfigManager } from '../shared/model-config';
import { EdgeLogger, withTimeout, withRetry } from '../shared/edge-logger';

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
  
  throw new Error(`Template ${templateName} not found in database`);
}

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    const { userId, deliberationId, content, maxRecommendations = 2 } = await parseAndValidateRequest(req, ['userId', 'deliberationId', 'content']);

    EdgeLogger.debug('Generating issue recommendations', { userId, deliberationId, contentLength: content.length });

    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();
    const openAIApiKey = getOpenAIKey();

    // Get existing issues for the deliberation
    const { data: existingIssues, error: issuesError } = await supabase
      .from('ibis_nodes')
      .select('id, title, description')
      .eq('deliberation_id', deliberationId)
      .eq('node_type', 'issue')
      .order('created_at', { ascending: false })
      .limit(20);

    if (issuesError) {
      throw new Error(`Error fetching existing issues: ${issuesError.message}`);
    }

    if (!existingIssues || existingIssues.length === 0) {
      console.log('📝 No existing issues found');
      return createSuccessResponse({ recommendations: [] });
    }

    // Format issues for AI analysis
    const issuesContext = existingIssues.map(issue => 
      `- ${issue.title}${issue.description ? `: ${issue.description}` : ''} (ID: ${issue.id})`
    ).join('\n');

    // Get prompt template from database
    const { data: templateData, error: templateError } = await supabase
      .rpc('get_prompt_template', { 
        template_name: 'Issue Recommendation System'
      });

    if (templateError || !templateData || templateData.length === 0) {
      throw new Error(`Failed to get prompt template: ${templateError?.message || 'Template not found'}`);
    }

    const template = templateData[0];
    
    // Replace template variables with actual values
    const aiPrompt = template.template_text
      .replace(/\{\{user_content\}\}/g, content)
      .replace(/\{\{existing_issues\}\}/g, issuesContext)
      .replace(/\{\{max_recommendations\}\}/g, maxRecommendations.toString());

    // Call OpenAI API
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...ModelConfigManager.generateAPIParams('gpt-5-2025-08-07', [
          {
            role: 'system',
            content: await getSystemMessage(supabase, 'issue_recommendation_system_message')
          },
          {
            role: 'user',
            content: aiPrompt
          }
        ])
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${openAIResponse.status}`);
    }

    const openAIData = await openAIResponse.json();
    const aiResponseContent = openAIData.choices?.[0]?.message?.content;

    if (!aiResponseContent) {
      throw new Error('No response from OpenAI');
    }

    console.log('🤖 OpenAI raw response:', aiResponseContent);

    // Parse AI response
    let aiRecommendations;
    try {
      // Extract JSON from response (handle potential markdown formatting)
      const jsonMatch = aiResponseContent.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : aiResponseContent;
      aiRecommendations = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw content:', aiResponseContent);
      throw new Error('Failed to parse AI recommendations');
    }

    // Validate and format recommendations
    const recommendations = [];
    for (const rec of aiRecommendations) {
      if (!rec.issueId || !rec.relevanceScore || !rec.explanation) {
        console.warn('Invalid recommendation format:', rec);
        continue;
      }

      // Find the matching issue
      const matchingIssue = existingIssues.find(issue => issue.id === rec.issueId);
      if (!matchingIssue) {
        console.warn('Issue ID not found in existing issues:', rec.issueId);
        continue;
      }

      if (rec.relevanceScore >= 0.6) {
        recommendations.push({
          issueId: matchingIssue.id,
          title: matchingIssue.title,
          description: matchingIssue.description,
          relevanceScore: rec.relevanceScore,
          explanation: rec.explanation
        });
      }
    }

    // Sort by relevance score
    recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Limit to maxRecommendations
    const finalRecommendations = recommendations.slice(0, maxRecommendations);

    console.log('✅ Generated recommendations:', finalRecommendations.length);

    return createSuccessResponse({ 
      recommendations: finalRecommendations,
      totalIssuesAnalysed: existingIssues.length 
    });

  } catch (error) {
    console.error('❌ Issue recommendations error:', error);
    return createErrorResponse(error, 500, 'generate-issue-recommendations');
  }
});