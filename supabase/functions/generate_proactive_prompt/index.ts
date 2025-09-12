import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '@supabase/supabase-js';

// Self-contained helpers (no cross-folder imports)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function handleCORSPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

async function parseAndValidateRequest<T extends Record<string, any>>(req: Request, required: string[]): Promise<T> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    throw new Error('Invalid JSON body');
  }
  for (const key of required) {
    if (!(key in body)) throw new Error(`Missing required field: ${key}`);
  }
  return body as T;
}

function getOpenAIKey(): string {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  return key;
}

function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new Error('Supabase environment not configured');
  return createClient(url, serviceKey);
}

// Helper to get system message from template
async function getProactivePromptSystemMessage(supabase: any, agentName: string): Promise<string> {
  try {
    const { data: templateData, error } = await supabase
      .rpc('get_prompt_template', { template_name: 'proactive_prompt_system_message' });

    if (error) console.warn('Template fetch error:', error);
    if (templateData && templateData.length > 0) {
      return templateData[0].template_text.replace(/\{\{agent_name\}\}/g, agentName);
    }
  } catch (err) {
    console.error('Failed to fetch proactive prompt system template', err);
  }
  return `You are ${agentName}, a thoughtful facilitator helping participants engage meaningfully in discussions.`;
}

serve(async (req) => {
  const cors = handleCORSPreflight(req);
  if (cors) return cors;

  try {
    const { userId, deliberationId, sessionContext } = await parseAndValidateRequest<{
      userId: string; deliberationId: string; sessionContext?: any;
    }>(req, ['userId', 'deliberationId']);

    const supabase = createServiceClient();
    const openAIApiKey = getOpenAIKey();

    // Fetch deliberation and flow agent
    const [{ data: deliberation, error: delibErr }, { data: flowAgents, error: agentErr }] = await Promise.all([
      supabase.from('deliberations')
        .select('title, description, notion')
        .eq('id', deliberationId)
        .single(),
      supabase.from('agent_configurations')
        .select('id, name, prompt_overrides, is_default')
        .eq('deliberation_id', deliberationId)
        .eq('agent_type', 'flow_agent')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .limit(1),
    ]);

    if (delibErr) throw new Error(`Error fetching deliberation: ${delibErr.message}`);
    if (agentErr) console.warn('Flow agent fetch error:', agentErr);

    const agentConfig = Array.isArray(flowAgents) ? flowAgents[0] : null;

    // Build system prompt for Flo (fallback if no custom prompt)
    const floSystemPrompt = agentConfig?.prompt_overrides?.system_prompt ||
      'You are Flo, a facilitative agent. Encourage reflection and participation with clear, kind prompts.';

    // Recent messages (5) and user engagement
    const [{ data: recentMessages }, { data: userMessages }] = await Promise.all([
      supabase.from('messages')
        .select('content, message_type, created_at')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('messages')
        .select('id, message_type')
        .eq('deliberation_id', deliberationId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const conversationSummary = (recentMessages || [])
      .map((m: any) => `${m.message_type}: ${m.content.slice(0, 100)}...`).join('\n')
      || 'No recent messages';

    const userEngagement = {
      totalMessages: userMessages?.length || 0,
      lastMessageType: userMessages?.[0]?.message_type || 'none',
      isNewToDiscussion: (userMessages?.length || 0) < 3,
    };

    // Session analysis (enhanced if provided)
    const sessionAnalysis = sessionContext ? {
      userExperience: sessionContext.totalSessions > 5 ? 'experienced' : sessionContext.totalSessions > 2 ? 'moderate' : 'new',
      sessionPhase: sessionContext.currentSessionAge > sessionContext.averageSessionDuration ? 'extended' : 'normal',
      engagementLevel: sessionContext.promptsSentThisSession > 2 ? 'low' : 'moderate',
      adaptivePrompting: true,
    } : { adaptivePrompting: false };

    // Template for AI prompt
    const { data: templateData, error: templateError } = await supabase
      .rpc('get_prompt_template', { template_name: 'generate_proactive_prompts' });
    if (templateError || !templateData || templateData.length === 0) {
      throw new Error(`Failed to get prompt template: ${templateError?.message || 'Template not found'}`);
    }
    const template = templateData[0];

    const sessionContextText = sessionContext ? `\nENHANCED SESSION CONTEXT:\n- User experience level: ${sessionAnalysis.userExperience} (${sessionContext.totalSessions} total sessions)\n- Current session duration: ${Math.round(sessionContext.currentSessionAge / 60000)} minutes\n- Average session duration: ${Math.round(sessionContext.averageSessionDuration / 60000)} minutes\n- Session phase: ${sessionAnalysis.sessionPhase}\n- Prompts sent this session: ${sessionContext.promptsSentThisSession}\n- Is long-running session: ${sessionContext.isLongSession ? 'yes' : 'no'}\n` : '';

    const userExperienceGuidance = sessionAnalysis.userExperience === 'new'
      ? 'Welcoming and providing gentle guidance for new participants'
      : sessionAnalysis.userExperience === 'experienced'
        ? 'Building on their experience and encouraging deeper insights'
        : '';
    const sessionPhaseGuidance = sessionAnalysis.sessionPhase === 'extended'
      ? 'Acknowledging their continued engagement and suggesting valuable contributions'
      : '';
    const engagementLevelGuidance = sessionAnalysis.engagementLevel === 'low'
      ? "Using a different approach since previous prompts haven't led to engagement"
      : '';

    const aiPrompt = template.template_text
      .replace(/\{\{flow_system_prompt\}\}/g, floSystemPrompt)
      .replace(/\{\{deliberation_title\}\}/g, deliberation.title)
      .replace(/\{\{deliberation_description\}\}/g, deliberation.description || 'No description available')
      .replace(/\{\{deliberation_notion\}\}/g, deliberation.notion || 'No notion statement')
      .replace(/\{\{user_engagement\}\}/g, String(userEngagement.totalMessages))
      .replace(/\{\{last_message_type\}\}/g, userEngagement.lastMessageType)
      .replace(/\{\{conversation_summary\}\}/g, conversationSummary)
      .replace(/\{\{session_context\}\}/g, sessionContextText)
      .replace(/\{\{user_experience_guidance\}\}/g, userExperienceGuidance)
      .replace(/\{\{session_phase_guidance\}\}/g, sessionPhaseGuidance)
      .replace(/\{\{engagement_level_guidance\}\}/g, engagementLevelGuidance);

    // Call OpenAI
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages: [
          { role: 'system', content: await getProactivePromptSystemMessage(supabase, agentConfig?.name || 'Flo') },
          { role: 'user', content: aiPrompt },
        ],
        max_completion_tokens: 300,
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      throw new Error(`OpenAI API error: ${openAIResponse.status} ${errorText}`);
    }

    const openAIData = await openAIResponse.json();
    const aiResponseContent = openAIData.choices?.[0]?.message?.content;
    if (!aiResponseContent) throw new Error('No response from OpenAI');

    // Parse response
    let promptData: any;
    try {
      const jsonMatch = aiResponseContent.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : aiResponseContent;
      promptData = JSON.parse(jsonStr);
    } catch {
      promptData = {
        question: "I'd love to hear your thoughts on this discussion. What aspects of this topic interest you most?",
        context: 'engagement',
      };
    }

    if (!promptData.question || typeof promptData.question !== 'string') {
      promptData.question = "What are your thoughts on the current discussion? I'd love to hear your perspective.";
    }
    if (!promptData.context || !['engagement', 'onboarding', 'catch_up', 'perspective', 'extended_session'].includes(promptData.context)) {
      promptData.context = sessionContext?.isLongSession ? 'extended_session' : 'engagement';
    }

    return new Response(JSON.stringify({
      prompt: promptData,
      deliberationTitle: deliberation.title,
      userEngagement,
      sessionAnalysis: sessionContext ? sessionAnalysis : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message, prompt: null }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});