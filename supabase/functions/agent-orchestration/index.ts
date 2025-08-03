import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SessionState {
  lastActivityTime: number;
  messageCount: number;
  statementCount: number;
  questionCount: number;
  topicsEngaged: string[];
  usedQuestionIds: string[];
  proactivePromptsCount: number;
  optedOutOfPrompts: boolean;
}

interface OrchestrationContext {
  messageId: string;
  deliberationId: string;
  userId: string;
  content: string;
  sessionState: SessionState;
  mode: 'chat' | 'learn';
}

interface FacilitatorQuestion {
  id: string;
  text: string;
  category: 'exploration' | 'perspective' | 'clarification' | 'synthesis' | 'action';
  weight: number;
}

const FACILITATION_QUESTIONS: FacilitatorQuestion[] = [
  {
    id: "explore_assumptions",
    text: "What assumptions might be underlying your perspective on this issue?",
    category: "exploration",
    weight: 0.8
  },
  {
    id: "different_viewpoint",
    text: "How might someone with a different background or experience view this differently?",
    category: "perspective",
    weight: 0.9
  },
  {
    id: "clarify_values",
    text: "What core values or principles are most important to you in thinking about this issue?",
    category: "clarification",
    weight: 0.7
  },
  {
    id: "synthesis_patterns",
    text: "What patterns or themes are you noticing across different perspectives shared so far?",
    category: "synthesis",
    weight: 0.6
  },
  {
    id: "action_implications",
    text: "If this perspective were widely adopted, what would be the practical implications?",
    category: "action",
    weight: 0.5
  }
];

serve(async (req) => {
  console.log('🚀 Agent orchestration function called!');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Environment validation
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    console.log('🔑 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      hasOpenAIKey: !!openAIApiKey
    });

    if (!supabaseUrl || !supabaseServiceKey || !openAIApiKey) {
      throw new Error('Missing required environment variables');
    }

    // Parse request body
    const body = await req.json();
    console.log('📊 Request body:', body);

    const { messageId, deliberationId, mode = 'chat' } = body;

    if (!messageId) {
      throw new Error('Missing messageId');
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the message
    console.log('📨 Fetching message...');
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      console.error('❌ Message fetch error:', messageError);
      throw new Error('Message not found');
    }

    console.log('✅ Message found:', message.content);

    // Create orchestration context
    const context: OrchestrationContext = {
      messageId,
      deliberationId: deliberationId || message.deliberation_id,
      userId: message.user_id,
      content: message.content,
      sessionState: await getSessionState(supabase, message.user_id),
      mode
    };

    console.log('🧠 Processing orchestration context for user:', context.userId);

    // Classify input type
    const inputType = await classifyInput(context.content);
    console.log('🏷️ Input classified as:', inputType);

    // Determine which agents should respond
    const agentTypes = await determineAgentResponses(inputType, context.sessionState, mode);
    console.log('🤖 Selected agents:', agentTypes);

    // Execute agent responses in parallel
    const responses = await Promise.allSettled(
      agentTypes.map(agentType => executeAgentResponse(agentType, context, supabase, openAIApiKey))
    );

    console.log('✅ Agent responses completed');

    // Handle any failures
    const failures = responses.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.warn('⚠️ Some agent responses failed:', failures);
    }

    // Handle proactive engagement for Flow Agent
    if (agentTypes.includes('flow_agent')) {
      await handleProactiveEngagement(context, supabase, openAIApiKey);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        agentsTriggered: agentTypes,
        failures: failures.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('💥 Orchestration error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function getSessionState(supabase: any, userId: string): Promise<SessionState> {
  console.log('📊 Getting session state for user:', userId);

  // Fetch recent messages from the user
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('content, message_type, created_at')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
    .order('created_at', { ascending: false });

  if (!recentMessages) {
    return getDefaultSessionState();
  }

  const userMessages = recentMessages.filter(m => m.message_type === 'user');
  
  // Analyze message patterns
  let statementCount = 0;
  let questionCount = 0;
  const topicsEngaged: string[] = [];

  userMessages.forEach(message => {
    if (message.content.includes('?')) {
      questionCount++;
    } else {
      statementCount++;
    }
    
    // Simple topic extraction (could be enhanced with NLP)
    const words = message.content.toLowerCase().split(' ');
    words.forEach(word => {
      if (word.length > 5 && !topicsEngaged.includes(word)) {
        topicsEngaged.push(word);
      }
    });
  });

  return {
    lastActivityTime: Date.now(),
    messageCount: userMessages.length,
    statementCount,
    questionCount,
    topicsEngaged: topicsEngaged.slice(0, 10), // Keep top 10
    usedQuestionIds: [],
    proactivePromptsCount: 0,
    optedOutOfPrompts: false
  };
}

function getDefaultSessionState(): SessionState {
  return {
    lastActivityTime: Date.now(),
    messageCount: 0,
    statementCount: 0,
    questionCount: 0,
    topicsEngaged: [],
    usedQuestionIds: [],
    proactivePromptsCount: 0,
    optedOutOfPrompts: false
  };
}

async function classifyInput(content: string): Promise<string> {
  // Simple classification logic - could be enhanced with AI
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('?')) {
    return 'QUESTION';
  }
  
  // Look for statement indicators
  const statementIndicators = ['i think', 'i believe', 'in my opinion', 'i feel', 'my view'];
  if (statementIndicators.some(indicator => lowerContent.includes(indicator))) {
    return 'STATEMENT';
  }
  
  return 'OTHER';
}

async function determineAgentResponses(
  inputType: string, 
  sessionState: SessionState, 
  mode: string
): Promise<string[]> {
  const agents: string[] = [];

  // For learn mode, prioritize Bill Agent
  if (mode === 'learn') {
    agents.push('bill_agent');
  } else {
    // Chat mode - more dynamic selection
    
    // Bill Agent for questions and learning
    if (inputType === 'QUESTION' || sessionState.messageCount < 3) {
      agents.push('bill_agent');
    }

    // Peer Agent for ongoing discussion
    if (sessionState.messageCount > 2 && Math.random() > 0.5) {
      agents.push('peer_agent');
    }

    // Flow Agent for facilitation
    if (sessionState.messageCount > 5 || sessionState.statementCount > 3) {
      agents.push('flow_agent');
    }
  }

  // Ensure at least Bill Agent responds
  if (agents.length === 0) {
    agents.push('bill_agent');
  }

  return agents;
}

async function executeAgentResponse(
  agentType: string,
  context: OrchestrationContext,
  supabase: any,
  openAIApiKey: string
): Promise<void> {
  console.log(`🎯 Executing ${agentType} response...`);

  try {
    // Fetch agent configuration
    const { data: agents } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('agent_type', agentType)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .limit(1);

    if (!agents || agents.length === 0) {
      console.warn(`⚠️ No active ${agentType} found`);
      return;
    }

    const agent = agents[0];
    console.log(`🤖 Using agent: ${agent.name}`);

    // Fetch conversation history
    const { data: conversationHistory } = await supabase
      .from('messages')
      .select('content, message_type, created_at')
      .eq('deliberation_id', context.deliberationId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Fetch deliberation context
    let deliberationContext = '';
    if (context.deliberationId) {
      const { data: deliberation } = await supabase
        .from('deliberations')
        .select('title, description, notion')
        .eq('id', context.deliberationId)
        .single();

      if (deliberation) {
        deliberationContext = `\nDeliberation: ${deliberation.title}\nDescription: ${deliberation.description || 'No description available'}`;
        if (deliberation.notion) {
          deliberationContext += `\nNotion: ${deliberation.notion}`;
        }
      }
    }

    // Build conversation context
    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      conversationContext = '\n\nRecent conversation:\n' + 
        conversationHistory.reverse().map(msg => 
          `${msg.message_type}: ${msg.content}`
        ).join('\n');
    }

    // Prepare messages for OpenAI
    const messages = [
      {
        role: 'system',
        content: agent.system_prompt + deliberationContext + conversationContext
      },
      {
        role: 'user',
        content: context.content
      }
    ];

    console.log('🧠 Generating response with OpenAI...');

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const agentResponse = data.choices[0].message.content;

    console.log(`💬 ${agentType} response: ${agentResponse.substring(0, 100)}...`);

    // Store agent response in database
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        content: agentResponse,
        message_type: agentType,
        user_id: context.userId,
        deliberation_id: context.deliberationId,
        agent_context: {
          agent_id: agent.id,
          agent_name: agent.name,
          response_style: agent.response_style,
          input_classification: await classifyInput(context.content)
        }
      });

    if (insertError) {
      console.error('❌ Error storing agent response:', insertError);
    } else {
      console.log('✅ Agent response stored successfully!');
    }

  } catch (error) {
    console.error(`💥 Error in ${agentType} execution:`, error);
    throw error;
  }
}

async function handleProactiveEngagement(
  context: OrchestrationContext,
  supabase: any,
  openAIApiKey: string
): Promise<void> {
  console.log('🔄 Handling proactive engagement...');

  // Check if we should send a proactive prompt
  const shouldPrompt = await shouldSendProactivePrompt(context);
  
  if (!shouldPrompt) {
    console.log('⏭️ Skipping proactive prompt');
    return;
  }

  // Select appropriate question
  const question = selectProactiveQuestion(context);
  
  if (!question) {
    console.log('❓ No suitable proactive question found');
    return;
  }

  console.log('💡 Sending proactive prompt:', question.text);

  // Store proactive prompt as flow agent message
  const { error } = await supabase
    .from('messages')
    .insert({
      content: question.text,
      message_type: 'flow_agent',
      user_id: context.userId,
      deliberation_id: context.deliberationId,
      agent_context: {
        proactive: true,
        question_id: question.id,
        category: question.category
      }
    });

  if (error) {
    console.error('❌ Error storing proactive prompt:', error);
  } else {
    console.log('✅ Proactive prompt stored successfully!');
  }
}

async function shouldSendProactivePrompt(context: OrchestrationContext): Promise<boolean> {
  // Don't overwhelm - limit proactive prompts
  if (context.sessionState.proactivePromptsCount >= 3) {
    return false;
  }

  // Don't prompt if user opted out
  if (context.sessionState.optedOutOfPrompts) {
    return false;
  }

  // Send prompts based on engagement patterns
  const timeSinceLastActivity = Date.now() - context.sessionState.lastActivityTime;
  const isEngaged = context.sessionState.messageCount > 3;
  const hasStatements = context.sessionState.statementCount > 1;

  return isEngaged && hasStatements && timeSinceLastActivity < 5 * 60 * 1000; // Within 5 minutes
}

function selectProactiveQuestion(context: OrchestrationContext): FacilitatorQuestion | null {
  // Filter out already used questions
  const availableQuestions = FACILITATION_QUESTIONS.filter(
    q => !context.sessionState.usedQuestionIds.includes(q.id)
  );

  if (availableQuestions.length === 0) {
    return null;
  }

  // Select based on session characteristics
  let preferredCategory: string | null = null;

  if (context.sessionState.questionCount > context.sessionState.statementCount) {
    preferredCategory = 'clarification';
  } else if (context.sessionState.messageCount > 8) {
    preferredCategory = 'synthesis';
  } else {
    preferredCategory = 'exploration';
  }

  // Find questions in preferred category first
  const preferredQuestions = availableQuestions.filter(q => q.category === preferredCategory);
  
  if (preferredQuestions.length > 0) {
    return preferredQuestions[Math.floor(Math.random() * preferredQuestions.length)];
  }

  // Fallback to any available question
  return availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
}