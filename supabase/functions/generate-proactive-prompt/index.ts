import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Agent configuration cache (5-minute TTL)
interface AgentCacheEntry {
  agent: any;
  timestamp: number;
}

const agentConfigCache = new Map<string, AgentCacheEntry>();
const AGENT_CACHE_DURATION = 1000 * 60 * 5; // 5 minutes
const MAX_AGENT_CACHE_SIZE = 100;

// Standardized agent config fetching with caching
async function getAgentConfig(supabase: any, agentType: string, deliberationId: string): Promise<any> {
  const cacheKey = `${agentType}:${deliberationId || 'global'}`;
  
  // Check cache first
  const cached = agentConfigCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < AGENT_CACHE_DURATION) {
    console.log(`🚀 Agent config cache hit: ${agentType}`);
    return cached.agent;
  }
  
  console.log(`🔄 Fetching agent config: ${agentType} for deliberation: ${deliberationId}`);
  
  try {
    // Step 1: Try local agent for this deliberation
    const { data: localAgent, error: localError } = await supabase
      .from('agent_configurations')
      .select('name, description, goals, response_style, prompt_overrides')
      .eq('deliberation_id', deliberationId)
      .eq('agent_type', agentType)
      .eq('is_active', true)
      .maybeSingle();
    
    if (localError) {
      console.warn(`Error fetching local ${agentType} agent:`, localError);
    }
    
    if (localAgent) {
      console.log(`✅ Found local ${agentType} agent`);
      cacheAgentConfig(cacheKey, localAgent);
      return localAgent;
    }
    
    // Step 2: Fallback to global agent
    console.log(`No local ${agentType} agent found, trying global agent`);
    const { data: globalAgent, error: globalError } = await supabase
      .from('agent_configurations')
      .select('name, description, goals, response_style, prompt_overrides')
      .eq('agent_type', agentType)
      .eq('is_default', true)
      .is('deliberation_id', null)
      .eq('is_active', true)
      .maybeSingle();
    
    if (globalError) {
      console.warn(`Error fetching global ${agentType} agent:`, globalError);
    }
    
    if (globalAgent) {
      console.log(`✅ Found global ${agentType} agent`);
      cacheAgentConfig(cacheKey, globalAgent);
      return globalAgent;
    }
    
    // Step 3: Return null for hardcoded fallback
    console.log(`No ${agentType} agent configuration found, will use hardcoded fallback`);
    cacheAgentConfig(cacheKey, null);
    return null;
    
  } catch (error) {
    console.error(`Failed to fetch ${agentType} agent configuration:`, error);
    return null;
  }
}

function cacheAgentConfig(key: string, agent: any): void {
  // Clean up cache if it's getting too large
  if (agentConfigCache.size >= MAX_AGENT_CACHE_SIZE) {
    cleanupAgentCache();
  }
  
  agentConfigCache.set(key, {
    agent,
    timestamp: Date.now()
  });
}

function cleanupAgentCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  // Remove expired entries
  for (const [key, entry] of agentConfigCache.entries()) {
    if ((now - entry.timestamp) > AGENT_CACHE_DURATION) {
      keysToDelete.push(key);
    }
  }
  
  // If still too many, remove oldest entries
  if (agentConfigCache.size - keysToDelete.length > MAX_AGENT_CACHE_SIZE) {
    const sortedEntries = Array.from(agentConfigCache.entries())
      .filter(([key]) => !keysToDelete.includes(key))
      .sort(([,a], [,b]) => a.timestamp - b.timestamp);
    
    const toRemove = sortedEntries.slice(0, 20); // Remove oldest 20
    keysToDelete.push(...toRemove.map(([key]) => key));
  }
  
  keysToDelete.forEach(key => agentConfigCache.delete(key));
  console.log(`🧹 Agent cache cleanup: removed ${keysToDelete.length} entries`);
}

// Standardized fallback prompts
function getFallbackSystemPrompt(agentType: string): string {
  switch (agentType) {
    case 'flow_agent':
      return `You are Flo, a helpful facilitation assistant in deliberative discussions. You guide conversation flow, encourage participation, and help users explore different perspectives on important topics.`;
    case 'bill_agent':
      return `You are Bill, a specialized AI assistant for policy analysis and legislative frameworks. You provide factual, balanced information about policy matters and help clarify complex legislative issues.`;
    case 'peer_agent':
      return `You are Pia, representing the collective voice and diverse perspectives in this discussion. You synthesize different viewpoints and help participants understand how their views relate to others.`;
    default:
      return `You are a helpful AI assistant facilitating meaningful discussion and engagement.`;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, deliberationId, sessionContext } = await req.json();
    
    if (!userId || !deliberationId) {
      throw new Error('Missing required fields: userId or deliberationId');
    }

    console.log('🤖 Generating enhanced proactive prompt', { 
      userId, 
      deliberationId, 
      sessionContext: sessionContext || 'no session context provided' 
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get deliberation details and Flo agent configuration (with caching)
    const [{ data: deliberation, error: deliberationError }, agentConfig] = await Promise.all([
      supabase
        .from('deliberations')
        .select('title, description, notion')
        .eq('id', deliberationId)
        .single(),
      getAgentConfig(supabase, 'flow_agent', deliberationId)
    ]);

    if (deliberationError) {
      throw new Error(`Error fetching deliberation: ${deliberationError.message}`);
    }

    // Generate system prompt from agent configuration
    let floSystemPrompt = '';
    if (agentConfig) {
      // Use custom system prompt if available
      floSystemPrompt = agentConfig.prompt_overrides?.system_prompt || 
        `You are ${agentConfig.name || 'Flo'}, ${agentConfig.description || 'a helpful facilitation assistant'}`;
      
      if (agentConfig.goals?.length) {
        floSystemPrompt += `\n\nYour goals are:\n${agentConfig.goals.map((g: string) => `- ${g}`).join('\n')}`;
      }
      
      if (agentConfig.response_style) {
        floSystemPrompt += `\n\nResponse style: ${agentConfig.response_style}`;
      }
    } else {
      // Standardized fallback system prompt
      console.warn('No Flo agent configuration found, using standardized fallback prompt');
      floSystemPrompt = getFallbackSystemPrompt('flow_agent');
    }

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

    // Analyze conversation context for prompt generation
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

    // Create enhanced AI prompt with session context using agent configuration
    const aiPrompt = `${floSystemPrompt}

CURRENT DELIBERATION CONTEXT:
- Topic: ${deliberation.title}
- Description: ${deliberation.description || 'No description available'}
- Notion statement: ${deliberation.notion || 'No notion statement'}
- User engagement: ${userEngagement.totalMessages} messages, last type: ${userEngagement.lastMessageType}
- Recent conversation:
${conversationSummary}

${sessionContext ? `
ENHANCED SESSION CONTEXT:
- User experience level: ${sessionAnalysis.userExperience} (${sessionContext.totalSessions} total sessions)
- Current session duration: ${Math.round(sessionContext.currentSessionAge / 60000)} minutes
- Average session duration: ${Math.round(sessionContext.averageSessionDuration / 60000)} minutes  
- Session phase: ${sessionAnalysis.sessionPhase}
- Prompts sent this session: ${sessionContext.promptsSentThisSession}
- Is long-running session: ${sessionContext.isLongSession ? 'yes' : 'no'}
` : ''}

PROACTIVE FACILITATION TASK: 
Generate a thoughtful, engaging proactive prompt to re-engage this user who has been inactive. The prompt should align with your facilitation style and goals while being:

1. Contextually relevant to the ongoing discussion
2. ${sessionAnalysis.userExperience === 'new' ? 'Welcoming and providing gentle guidance for new participants' : ''}
3. ${sessionAnalysis.userExperience === 'experienced' ? 'Building on their experience and encouraging deeper insights' : ''}
4. ${sessionAnalysis.sessionPhase === 'extended' ? 'Acknowledging their continued engagement and suggesting valuable contributions' : ''}
5. ${sessionAnalysis.engagementLevel === 'low' ? 'Using a different approach since previous prompts haven\'t led to engagement' : ''}
6. Encouraging but not pushy
7. Offering specific, actionable ways to contribute
8. Concise (1-2 sentences)

Consider these contexts:
- If new participant: Welcome and guide them with specific first steps
- If experienced participant: Build on their previous contributions and session history
- If discussion is quiet: Encourage broader participation with specific conversation starters
- If discussion is active: Help them catch up or add fresh perspective
- If extended session: Acknowledge their dedication and suggest high-value contributions

Respond with JSON in this format:
{
  "question": "Your engaging proactive prompt here",
  "context": "engagement|onboarding|catch_up|perspective|extended_session"
}`;

    // Call OpenAI API
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: agentConfig ? 
              `You are ${agentConfig.name || 'Flo'}, an expert facilitator skilled at engaging participants in meaningful deliberation. Always respond with valid JSON.` :
              'You are Flo, an expert facilitator skilled at engaging participants in meaningful deliberation. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: aiPrompt
          }
        ],
        max_tokens: 300,
        temperature: 0.7
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