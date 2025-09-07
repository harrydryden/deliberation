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
import { AgentOrchestrator } from '../shared/agent-orchestrator.ts';
import { ModelConfigManager } from '../shared/model-config.ts';

// Remove the old duplicate cache/config functions - they're now in the shared orchestrator

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    const { userId, deliberationId, sessionContext } = await parseAndValidateRequest(req, ['userId', 'deliberationId']);
    
    console.log('🤖 Generating enhanced proactive prompt', { 
      userId, 
      deliberationId, 
      sessionContext: sessionContext || 'no session context provided' 
    });

    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();
    const openAIApiKey = getOpenAIKey();

    const orchestrator = new AgentOrchestrator(supabase);

    // Get deliberation details and Flo agent configuration using orchestrator
    const [{ data: deliberation, error: deliberationError }, agentConfig] = await Promise.all([
      supabase
        .from('deliberations')
        .select('title, description, notion')
        .eq('id', deliberationId)
        .single(),
      orchestrator.getAgentConfig('flow_agent', deliberationId)
    ]);

    if (deliberationError) {
      throw new Error(`Error fetching deliberation: ${deliberationError.message}`);
    }

    // Generate system prompt using orchestrator
    const floSystemPrompt = orchestrator.generateSystemPrompt(agentConfig, 'flow_agent');

    // Get recent conversation context (last 5 messages)
    const { data: recentMessages, error: messagesError } = await supabase
      .from('messages')
      .select('content, message_type, created_at')
      .eq('deliberation_id', deliberationId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (messagesError) {
      console.warn('Error fetching recent messages:', messagesError);
    }

    // Get user's participation level
    const { data: userMessages, error: userMessagesError } = await supabase
      .from('messages')
      .select('id, message_type')
      .eq('deliberation_id', deliberationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (userMessagesError) {
      console.warn('Error fetching user messages:', userMessagesError);
    }

    // Analyse conversation context for prompt generation
    const conversationSummary = recentMessages?.map(msg => 
      `${msg.message_type}: ${msg.content.slice(0, 100)}...`
    ).join('\n') || 'No recent messages';

    const userEngagement = {
      totalMessages: userMessages?.length || 0,
      lastMessageType: userMessages?.[0]?.message_type || 'none',
      isNewToDiscussion: (userMessages?.length || 0) < 3
    };

    // Enhanced session context analysis
    const sessionAnalysis = sessionContext ? {
      userExperience: sessionContext.totalSessions > 5 ? 'experienced' : sessionContext.totalSessions > 2 ? 'moderate' : 'new',
      sessionPhase: sessionContext.currentSessionAge > sessionContext.averageSessionDuration ? 'extended' : 'normal',
      engagementLevel: sessionContext.promptsSentThisSession > 2 ? 'low' : 'moderate',
      adaptivePrompting: true
    } : { adaptivePrompting: false };

    // Get proactive prompt template from database
    const { data: templateData, error: templateError } = await supabase
      .rpc('get_prompt_template', { 
        template_name: 'generate_proactive_prompts'
      });

    if (templateError || !templateData || templateData.length === 0) {
      throw new Error(`Failed to get prompt template: ${templateError?.message || 'Template not found'}`);
    }

    const template = templateData[0];
    
    // Prepare guidance based on session analysis
    const userExperienceGuidance = sessionAnalysis.userExperience === 'new' 
      ? 'Welcoming and providing gentle guidance for new participants' 
      : sessionAnalysis.userExperience === 'experienced' 
        ? 'Building on their experience and encouraging deeper insights' 
        : '';
    
    const sessionPhaseGuidance = sessionAnalysis.sessionPhase === 'extended' 
      ? 'Acknowledging their continued engagement and suggesting valuable contributions' 
      : '';
    
    const engagementLevelGuidance = sessionAnalysis.engagementLevel === 'low' 
      ? 'Using a different approach since previous prompts haven\'t led to engagement' 
      : '';

    const sessionContextText = sessionContext ? `
ENHANCED SESSION CONTEXT:
- User experience level: ${sessionAnalysis.userExperience} (${sessionContext.totalSessions} total sessions)
- Current session duration: ${Math.round(sessionContext.currentSessionAge / 60000)} minutes
- Average session duration: ${Math.round(sessionContext.averageSessionDuration / 60000)} minutes  
- Session phase: ${sessionAnalysis.sessionPhase}
- Prompts sent this session: ${sessionContext.promptsSentThisSession}
- Is long-running session: ${sessionContext.isLongSession ? 'yes' : 'no'}
` : '';

    // Replace template variables with actual values
    const aiPrompt = template.template_text
      .replace(/\{\{flow_system_prompt\}\}/g, floSystemPrompt)
      .replace(/\{\{deliberation_title\}\}/g, deliberation.title)
      .replace(/\{\{deliberation_description\}\}/g, deliberation.description || 'No description available')
      .replace(/\{\{deliberation_notion\}\}/g, deliberation.notion || 'No notion statement')
      .replace(/\{\{user_engagement\}\}/g, userEngagement.totalMessages.toString())
      .replace(/\{\{last_message_type\}\}/g, userEngagement.lastMessageType)
      .replace(/\{\{conversation_summary\}\}/g, conversationSummary)
      .replace(/\{\{session_context\}\}/g, sessionContextText)
      .replace(/\{\{user_experience_guidance\}\}/g, userExperienceGuidance)
      .replace(/\{\{session_phase_guidance\}\}/g, sessionPhaseGuidance)
      .replace(/\{\{engagement_level_guidance\}\}/g, engagementLevelGuidance);

    // Call OpenAI API
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: await getProactivePromptSystemMessage(supabase, agentConfig?.name || 'Flo')
          },
          {
            role: 'user',
            content: aiPrompt
          }
        ],
        max_completion_tokens: 300
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
    let promptData;
    try {
      // Extract JSON from response (handle potential markdown formatting)
      const jsonMatch = aiResponseContent.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : aiResponseContent;
      promptData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback prompt
      promptData = {
        question: "I'd love to hear your thoughts on this discussion. What aspects of this topic interest you most?",
        context: "engagement"
      };
    }

    // Validate prompt data
    if (!promptData.question || typeof promptData.question !== 'string') {
      promptData.question = "What are your thoughts on the current discussion? I'd love to hear your perspective.";
    }

    if (!promptData.context || !['engagement', 'onboarding', 'catch_up', 'perspective', 'extended_session'].includes(promptData.context)) {
      promptData.context = sessionContext?.isLongSession ? "extended_session" : "engagement";
    }

    console.log('✅ Generated enhanced proactive prompt with agent config:', { 
      prompt: promptData,
      agentUsed: agentConfig ? {
        name: agentConfig.name,
        type: floAgent ? 'local' : 'global',
        hasCustomPrompt: !!agentConfig.prompt_overrides?.system_prompt
      } : 'fallback'
    });

    return new Response(JSON.stringify({ 
      prompt: promptData,
      deliberationTitle: deliberation.title,
      userEngagement,
      sessionAnalysis: sessionContext ? sessionAnalysis : null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Proactive prompt generation error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      prompt: null 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});