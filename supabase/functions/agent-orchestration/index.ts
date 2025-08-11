import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversationState {
  messageCount: number;
  topicDepth: number;
  userEngagement: number;
  lastAgentUsed: string;
  topicKeywords: string[];
  ibisElements: {
    issues: string[];
    positions: string[];
    arguments: string[];
  };
  lastActivityTime: number;
  usedQuestionIds: string[];
  proactivePromptsCount: number;
  optedOutOfPrompts: boolean;
}

interface SemanticAnalysis {
  intent: string;
  complexity: number; // 0-1
  topicRelevance: number; // 0-1
  questionType: 'basic' | 'detailed' | 'argumentative' | 'collaborative';
  entities: string[];
  sentiment: number; // -1 to 1
  requiresExpertise: boolean;
  discussionPotential: number; // 0-1
  isFactualQuery: boolean; // New field for factual query detection
}

interface OrchestrationContext {
  messageId: string;
  deliberationId: string;
  userId: string;
  content: string;
  conversationState: ConversationState;
  mode: 'chat' | 'learn';
  similarNodes?: SimilarNode[];
}

interface SimilarNode {
  id: string;
  title: string;
  description: string;
  nodeType: string;
  similarity: number;
  relationship: 'supportive' | 'contradictory';
  createdBy: {
    displayName: string;
  };
}

interface FacilitatorQuestion {
  id: string;
  text: string;
  category: 'exploration' | 'perspective' | 'clarification' | 'synthesis' | 'action';
  weight: number;
}

// Domain override patterns for legislative/factual queries
const DOMAIN_OVERRIDES = [
  {
    patterns: [
      /recommendation|recommendations?/i,
      /legislation|legislative/i,
      /policy|policies/i,
      /law|laws|legal/i,
      /regulation|regulations?/i,
      /official|government|authority/i,
      /guideline|guidelines?/i,
      /what is the.*position/i,
      /facts? about/i,
      /what does the.*say/i
    ],
    requiredAgent: 'bill_agent',
    minConfidence: 0.7
  }
];

// Factual query indicators
const FACTUAL_INDICATORS = [
  'what is', 'what are', 'what does', 'what do',
  'recommendation', 'recommendations', 'official',
  'law', 'legal', 'legislation', 'policy', 'regulation',
  'guideline', 'government', 'authority', 'position'
];

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
      conversationState: await getConversationState(supabase, message.user_id, deliberationId),
      mode
    };

    console.log('🧠 Processing orchestration context for user:', context.userId);

    // Perform semantic analysis
    const analysis = await analyzeMessage(context.content, context.conversationState, openAIApiKey);
    console.log('🔬 Semantic analysis:', analysis);

    // Check for similar IBIS nodes
    const similarNodes = await findSimilarIbisNodes(context.content, context.deliberationId, supabase, openAIApiKey);
    context.similarNodes = similarNodes;
    console.log(`🔍 Found ${similarNodes.length} similar IBIS nodes`);

    // Select appropriate agent using sophisticated algorithm
    const selectedAgent = selectAgent(analysis, context.conversationState, mode);
    console.log('🤖 Selected agent:', selectedAgent);

    // Determine if we need multi-agent response
    const agents = determineAgentsToExecute(selectedAgent, similarNodes);
    console.log('🤖 Agents to execute:', agents);

    // Update conversation state
    updateConversationState(context.conversationState, analysis, selectedAgent);

    // Execute agent responses (potentially multiple)
    const agentResponses = await executeAgentResponses(agents, context, supabase, openAIApiKey, analysis);

    console.log('✅ Agent response completed');

    // Handle proactive engagement for Flow Agent
    if (agents.includes('flow_agent')) {
      await handleProactiveEngagement(context, supabase, openAIApiKey);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        selectedAgent,
        confidence: calculateConfidence(selectedAgent, analysis, context.conversationState),
        agentResponses: agentResponses || [],
        similarNodes: similarNodes || []
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

// Semantic analysis using OpenAI GPT-4
async function analyzeMessage(content: string, state: ConversationState, openAIApiKey: string): Promise<SemanticAnalysis> {
  const prompt = `
Analyze this message in the context of an ongoing conversation about a specific topic.
Pay special attention to:
1. Is this asking for FACTS, LAWS, or OFFICIAL INFORMATION?
2. Does it contain: recommendation, legislation, policy, guideline?
3. Is this seeking authoritative knowledge vs. discussion?

Current conversation depth: ${state.messageCount} messages
Topic depth: ${state.topicDepth}
Previous keywords: ${state.topicKeywords.join(', ')}
User engagement level: ${state.userEngagement}

Message: "${content}"

Provide analysis in the following JSON format:
{
  "intent": "user's primary intent (brief description)",
  "complexity": 0.0-1.0,
  "topicRelevance": 0.0-1.0,
  "questionType": "basic|detailed|argumentative|collaborative",
  "entities": ["key entities, topics, or concepts mentioned"],
  "sentiment": -1.0 to 1.0,
  "requiresExpertise": true|false,
  "discussionPotential": 0.0-1.0,
  "isFactualQuery": true|false
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a semantic analyzer for a multi-agent deliberation system. Analyze the message and respond with ONLY valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 200
      })
    });

    const data = await response.json();
    const analysisText = data.choices[0].message.content;
    
    try {
      return JSON.parse(analysisText);
    } catch (parseError) {
      console.warn('⚠️ Failed to parse semantic analysis JSON, using fallback');
      return getFallbackAnalysis(content);
    }
  } catch (error) {
    console.error('❌ Semantic analysis error:', error);
    return getFallbackAnalysis(content);
  }
}

// Agent selection algorithm with sophisticated scoring
function selectAgent(analysis: SemanticAnalysis, state: ConversationState, mode: string): string {
  // Check domain overrides first
  for (const override of DOMAIN_OVERRIDES) {
    if (override.patterns.some(pattern => pattern.test(analysis.intent))) {
      console.log('🎯 Domain override triggered - routing to:', override.requiredAgent);
      return override.requiredAgent;
    }
  }

  // Calculate agent scores
  const scores = {
    flow_agent: calculateFlowScore(analysis, state, mode),
    bill_agent: calculateBillScore(analysis, state, mode),
    peer_agent: calculatePeerScore(analysis, state, mode)
  };

  console.log('🎯 Agent scores:', scores);

  // Select agent with highest score
  return Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b)[0];
}

// Flow Agent scoring (default for basic questions)
function calculateFlowScore(analysis: SemanticAnalysis, state: ConversationState, mode: string): number {
  let score = 0.5; // Base score as default agent

  // Boost for basic questions at conversation start
  if (state.messageCount < 3) score += 0.3;
  if (analysis.questionType === 'basic') score += 0.4;
  if (analysis.complexity < 0.3) score += 0.3;
  
  // Reduce score for complex or detailed queries
  if (analysis.requiresExpertise) score -= 0.4;
  if (analysis.complexity > 0.7) score -= 0.3;
  
  // Reduce score as conversation progresses
  score -= Math.min(state.messageCount * 0.015, 0.3);

  // Mode-specific adjustments
  if (mode === 'learn') score -= 0.2;

  return Math.max(0, Math.min(1, score));
}

// Bill Agent scoring (expert knowledge)
function calculateBillScore(analysis: SemanticAnalysis, state: ConversationState, mode: string): number {
  let score = 0.3; // Increased base score

  // Strong boost for factual queries
  if (analysis.isFactualQuery) score += 0.4;
  
  // Check for factual indicators in content
  const contentLower = analysis.intent.toLowerCase();
  const hasFactualIndicator = FACTUAL_INDICATORS.some(indicator => 
    contentLower.includes(indicator.toLowerCase())
  );
  if (hasFactualIndicator) score += 0.4;

  // Boost for detailed/expert questions
  if (analysis.questionType === 'detailed') score += 0.5;
  if (analysis.requiresExpertise) score += 0.3; // Reduced to balance with factual boost
  if (analysis.complexity > 0.6) score += 0.3;
  if (analysis.topicRelevance > 0.8) score += 0.2;
  
  // Consider conversation depth
  if (state.topicDepth > 2) score += 0.2;
  
  // Reduce if too collaborative (but only if not factual)
  if (analysis.discussionPotential > 0.7 && !analysis.isFactualQuery) score -= 0.2;

  // Mode-specific adjustments
  if (mode === 'learn') score += 0.3;

  return Math.max(0, Math.min(1, score));
}

// Peer Agent scoring (discussion facilitation)
function calculatePeerScore(analysis: SemanticAnalysis, state: ConversationState, mode: string): number {
  let score = 0.15; // Base score

  // Progressive increase based on conversation length (reduced rate)
  score += Math.min(state.messageCount * 0.025, 0.25); // Reduced from 0.04 to 0.025, capped at 0.25
  
  // Penalize heavily for expertise/factual queries
  if (analysis.requiresExpertise || analysis.isFactualQuery) {
    score *= 0.5; // 50% reduction for expertise queries
  }
  
  // Only boost for discussion if not requiring expertise
  if (!analysis.requiresExpertise && !analysis.isFactualQuery) {
    // Boost for argumentative/collaborative content
    if (analysis.questionType === 'argumentative') score += 0.4;
    if (analysis.questionType === 'collaborative') score += 0.5;
    if (analysis.discussionPotential > 0.6) score += 0.25; // Reduced from 0.3
  }
  
  // Boost if IBIS elements are building up (only if not factual)
  if (!analysis.isFactualQuery) {
    const ibisCount = state.ibisElements.issues.length + 
                     state.ibisElements.positions.length + 
                     state.ibisElements.arguments.length;
    score += Math.min(ibisCount * 0.1, 0.3);
  }
  
  // Boost for high engagement (only if not factual)
  if (state.userEngagement > 0.7 && !analysis.isFactualQuery) score += 0.2;
  
  // Reduce at very start of conversation
  if (state.messageCount < 2) score -= 0.3;

  // Mode-specific adjustments
  if (mode === 'learn') score -= 0.2;

  return Math.max(0, Math.min(1, score));
}

// Get or initialize conversation state
async function getConversationState(supabase: any, userId: string, deliberationId: string): Promise<ConversationState> {
  console.log('📊 Getting conversation state for user:', userId);

  // Fetch recent messages from the conversation
  let query = supabase
    .from('messages')
    .select('content, message_type, created_at, agent_context')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });

  if (deliberationId) {
    query = query.eq('deliberation_id', deliberationId);
  }

  const { data: recentMessages } = await query;

  if (!recentMessages || recentMessages.length === 0) {
    return getDefaultConversationState();
  }

  const userMessages = recentMessages.filter(m => m.message_type === 'user');
  const agentMessages = recentMessages.filter(m => m.message_type !== 'user');
  
  // Analyze message patterns and extract keywords
  const topicKeywords: string[] = [];
  const ibisElements = { issues: [], positions: [], arguments: [] };
  
  userMessages.forEach(message => {
    // Extract keywords (entities, topics)
    const words = message.content.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 4 && !topicKeywords.includes(word)) {
        topicKeywords.push(word);
      }
    });

    // Simple IBIS pattern detection
    updateIBISFromContent(message.content, ibisElements);
  });

  // Calculate engagement based on message frequency and sentiment patterns
  const userEngagement = Math.min(userMessages.length / 10, 1) * 0.7 + 
                        (agentMessages.length > 0 ? 0.3 : 0);

  const lastAgentUsed = agentMessages.length > 0 ? 
    agentMessages[0].message_type : 'flow_agent';

  return {
    messageCount: userMessages.length,
    topicDepth: Math.min(Math.floor(userMessages.length / 3), 5),
    userEngagement,
    lastAgentUsed,
    topicKeywords: topicKeywords.slice(0, 10),
    ibisElements,
    lastActivityTime: Date.now(),
    usedQuestionIds: [],
    proactivePromptsCount: 0,
    optedOutOfPrompts: false
  };
}

function getDefaultConversationState(): ConversationState {
  return {
    messageCount: 0,
    topicDepth: 0,
    userEngagement: 0.5,
    lastAgentUsed: 'flow_agent',
    topicKeywords: [],
    ibisElements: {
      issues: [],
      positions: [],
      arguments: []
    },
    lastActivityTime: Date.now(),
    usedQuestionIds: [],
    proactivePromptsCount: 0,
    optedOutOfPrompts: false
  };
}

// Update conversation state after processing
function updateConversationState(state: ConversationState, analysis: SemanticAnalysis, selectedAgent: string): void {
  state.messageCount++;
  state.lastAgentUsed = selectedAgent;
  state.lastActivityTime = Date.now();
  
  // Update topic depth
  if (analysis.complexity > 0.6 || analysis.requiresExpertise) {
    state.topicDepth = Math.min(state.topicDepth + 1, 5);
  }
  
  // Update engagement
  const engagementDelta = analysis.sentiment > 0 ? 0.1 : -0.05;
  state.userEngagement = Math.max(0, Math.min(1, state.userEngagement + engagementDelta));
  
  // Update keywords
  analysis.entities.forEach(entity => {
    if (!state.topicKeywords.includes(entity)) {
      state.topicKeywords.push(entity);
    }
  });
  
  // Keep only recent keywords
  if (state.topicKeywords.length > 10) {
    state.topicKeywords = state.topicKeywords.slice(-10);
  }
  
  // Update IBIS elements
  updateIBISFromAnalysis(analysis, state.ibisElements);
}

// Update IBIS elements from content
function updateIBISFromContent(content: string, ibisElements: any): void {
  const lowerContent = content.toLowerCase();
  
  // Issue patterns
  if (lowerContent.includes('?') || lowerContent.includes('problem') || 
      lowerContent.includes('challenge') || lowerContent.includes('issue')) {
    ibisElements.issues.push(content.substring(0, 100));
  }
  
  // Position patterns
  if (lowerContent.includes('i think') || lowerContent.includes('in my opinion') || 
      lowerContent.includes('we should') || lowerContent.includes('the solution')) {
    ibisElements.positions.push(content.substring(0, 100));
  }
  
  // Argument patterns
  if (lowerContent.includes('because') || lowerContent.includes('therefore') || 
      lowerContent.includes('however') || lowerContent.includes('evidence')) {
    ibisElements.arguments.push(content.substring(0, 100));
  }
}

// Update IBIS elements from semantic analysis
function updateIBISFromAnalysis(analysis: SemanticAnalysis, ibisElements: any): void {
  if (analysis.questionType === 'argumentative') {
    if (analysis.intent.includes('because') || analysis.intent.includes('therefore')) {
      ibisElements.arguments.push(analysis.intent);
    }
  } else if (analysis.discussionPotential > 0.7) {
    ibisElements.positions.push(analysis.intent);
  }
  
  if (analysis.intent.includes('?') || analysis.intent.includes('problem')) {
    ibisElements.issues.push(analysis.intent);
  }
}

// Calculate response confidence
function calculateConfidence(agent: string, analysis: SemanticAnalysis, state: ConversationState): number {
  const scores = {
    flow_agent: calculateFlowScore(analysis, state, 'chat'),
    bill_agent: calculateBillScore(analysis, state, 'chat'),
    peer_agent: calculatePeerScore(analysis, state, 'chat')
  };
  
  const selectedScore = scores[agent as keyof typeof scores];
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  
  return totalScore > 0 ? selectedScore / totalScore : 0;
}

// Fallback analysis for error scenarios
function getFallbackAnalysis(content: string): SemanticAnalysis {
  const isQuestion = content.includes('?');
  const wordCount = content.split(' ').length;
  const entities = content.split(' ').filter(word => word.length > 5).slice(0, 3);
  
  // Check for factual indicators in fallback
  const contentLower = content.toLowerCase();
  const isFactual = FACTUAL_INDICATORS.some(indicator => 
    contentLower.includes(indicator.toLowerCase())
  );
  
  return {
    intent: content.substring(0, 50),
    complexity: Math.min(wordCount / 30, 1),
    topicRelevance: 0.5,
    questionType: isQuestion ? 'basic' : 'collaborative',
    entities,
    sentiment: 0,
    requiresExpertise: wordCount > 20 || isFactual,
    discussionPotential: isQuestion ? 0.3 : 0.6,
    isFactualQuery: isFactual
  };
}

async function executeAgentResponse(
  agentType: string,
  context: OrchestrationContext,
  supabase: any,
  openAIApiKey: string,
  analysis: SemanticAnalysis
): Promise<string> {
  console.log(`🎯 Executing ${agentType} response...`);

  try {
    // Fetch agent configuration - only agents mapped to this deliberation
    let { data: agents } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('agent_type', agentType)
      .eq('deliberation_id', context.deliberationId)
      .eq('is_active', true)
      .order('is_default', { ascending: false });
    
    if (agentType === 'bill_agent' && agents && agents.length > 1) {
      // For bill_agent, check which agent has knowledge and prioritize it
      for (const agent of agents) {
        const { count } = await supabase
          .from('agent_knowledge')
          .select('*', { count: 'exact', head: true })
          .eq('agent_id', agent.id);
        
        if (count && count > 0) {
          agents = [agent]; // Use the agent with knowledge
          console.log(`✅ Selected bill_agent with knowledge: ${agent.name} (${count} documents)`);
          break;
        }
      }
    }

    if (!agents || agents.length === 0) {
      console.warn(`⚠️ No active ${agentType} found for deliberation ${context.deliberationId}`);
      return '';
    }

    const agent = agents[0];
    console.log(`🤖 Using agent: ${agent.name} (ID: ${agent.id})`);

    // Fetch conversation history
    const { data: conversationHistory } = await supabase
      .from('messages')
      .select('content, message_type, created_at')
      .eq('deliberation_id', context.deliberationId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Fetch relevant knowledge for bill_agent
    let knowledgeContext = '';
    let sources: string[] = [];
    if (agentType === 'bill_agent') {
      try {
        console.log(`🔍 Fetching knowledge for agent: ${agent.id} with query: "${context.content}"`);
        const knowledgeResponse = await supabase.functions.invoke('query-agent-knowledge', {
          body: {
            query: context.content,
            agentId: agent.id,
            maxResults: 3
          }
        });

        console.log('📚 Knowledge response:', knowledgeResponse);

        if (knowledgeResponse.data?.success && knowledgeResponse.data?.relevantKnowledge?.length > 0) {
          const knowledge = knowledgeResponse.data.relevantKnowledge;
          console.log(`✅ Found ${knowledge.length} relevant knowledge items`);
          knowledgeContext = '\n\nRELEVANT KNOWLEDGE:\n' + 
            knowledge.map((item: any, index: number) => 
              `[${index + 1}] ${item.title}: ${item.content.substring(0, 500)}...`
            ).join('\n\n');

          // Extract unique source files for reference
          sources = [...new Set(knowledge
            .map((item: any) => item.file_name || item.title)
            .filter((source: string) => source)
          )];
          console.log('📖 Sources found:', sources);
        } else {
          console.log('ℹ️ No relevant knowledge found for this query');
        }
      } catch (error) {
        console.warn('⚠️ Knowledge retrieval failed:', error);
      }
    }

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

    // Build similar nodes context for peer agent
    let similarNodesContext = '';
    if (agentType === 'peer_agent' && context.similarNodes && context.similarNodes.length > 0) {
      const contextParts = context.similarNodes.map(node => {
        const relationshipText = node.relationship === 'supportive' ? 'in support' : 'in contradiction';
        return `Another participant (${node.createdBy.displayName}) has shared a ${node.nodeType} that relates to this ${relationshipText}:
"${node.title}${node.description ? ': ' + node.description : ''}"`;
      });

      similarNodesContext = `\n\nIMPORTANT - SIMILAR CONTRIBUTIONS FOUND:
${contextParts.join('\n\n')}

You MUST mention these similar contributions in your response using this exact format:
"Another participant has shared a view that relates to this [in support/in contradiction]" and then reference the specific contribution. Make this the main focus of your response.`;
    }

    // Prepare messages for OpenAI
    const systemPrompt = agent.system_prompt + deliberationContext + conversationContext + knowledgeContext + similarNodesContext;
    
    // Add source citation instruction for bill_agent
    const finalSystemPrompt = agentType === 'bill_agent' && sources.length > 0 
      ? systemPrompt + '\n\nIMPORTANT: When referencing information from the knowledge base, add a brief "Sources:" section at the end of your response. List only the document names without file extensions (e.g., "Assisted Dying Bill - UK" not "Assisted Dying Bill - UK.pdf").'
      : systemPrompt;

    const messages = [
      {
        role: 'system',
        content: finalSystemPrompt
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
    let agentResponse = data.choices[0].message.content;

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
          input_classification: analysis.questionType,
          semantic_analysis: {
            complexity: analysis.complexity,
            intent: analysis.intent,
            requiresExpertise: analysis.requiresExpertise
          },
          similar_nodes: agentType === 'peer_agent' ? context.similarNodes : undefined
        }
      });

    if (insertError) {
      console.error('❌ Error storing agent response:', insertError);
    } else {
      console.log('✅ Agent response stored successfully!');
    }

    return agentResponse;

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
  if (context.conversationState.proactivePromptsCount >= 3) {
    return false;
  }

  // Don't prompt if user opted out
  if (context.conversationState.optedOutOfPrompts) {
    return false;
  }

  // Send prompts based on engagement patterns
  const timeSinceLastActivity = Date.now() - context.conversationState.lastActivityTime;
  const isEngaged = context.conversationState.messageCount > 3;
  const hasIbisElements = (context.conversationState.ibisElements.issues.length + 
                          context.conversationState.ibisElements.positions.length + 
                          context.conversationState.ibisElements.arguments.length) > 1;

  return isEngaged && hasIbisElements && timeSinceLastActivity < 5 * 60 * 1000; // Within 5 minutes
}

function selectProactiveQuestion(context: OrchestrationContext): FacilitatorQuestion | null {
  // Filter out already used questions
  const availableQuestions = FACILITATION_QUESTIONS.filter(
    q => !context.conversationState.usedQuestionIds.includes(q.id)
  );

  if (availableQuestions.length === 0) {
    return null;
  }

  // Select based on conversation characteristics
  let preferredCategory: string | null = null;

  if (context.conversationState.ibisElements.arguments.length > context.conversationState.ibisElements.positions.length) {
    preferredCategory = 'clarification';
  } else if (context.conversationState.messageCount > 8) {
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

// Find similar IBIS nodes using semantic similarity
async function findSimilarIbisNodes(
  content: string, 
  deliberationId: string, 
  supabase: any, 
  openAIApiKey: string
): Promise<SimilarNode[]> {
  console.log('🔍 Finding similar IBIS nodes...');
  
  try {
    // Fetch all IBIS nodes in this deliberation except from current user
    const { data: allNodes } = await supabase
      .from('ibis_nodes')
      .select(`
        id,
        title,
        description,
        node_type,
        created_by,
        profiles!created_by(display_name)
      `)
      .eq('deliberation_id', deliberationId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!allNodes?.length) return [];

    // Calculate semantic similarity for each node using OpenAI
    const similarities = await Promise.all(
      allNodes.map(async (node) => {
        const relevancePrompt = `
Rate the semantic similarity between these two statements on a scale of 0.0 to 1.0:

Statement A: "${content}"
Statement B: "${node.title}: ${node.description || ''}"

Consider:
- Topic overlap
- Conceptual relationship
- Argumentative stance
- Thematic connection

Respond with only a number between 0.0 and 1.0:`;

        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: 'You are a semantic similarity analyzer. Respond only with a decimal number between 0.0 and 1.0.' },
                { role: 'user', content: relevancePrompt }
              ],
              temperature: 0.1,
              max_tokens: 10
            })
          });

          const data = await response.json();
          const similarityText = data.choices[0].message.content.trim();
          const similarity = parseFloat(similarityText) || 0;
          
          return { ...node, similarity };
        } catch (error) {
          console.warn('Error calculating similarity for node:', node.id, error);
          return { ...node, similarity: 0 };
        }
      })
    );

    // Filter high similarity nodes and determine relationships
    const similarNodes = similarities
      .filter(node => node.similarity > 0.75)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);

    if (!similarNodes.length) return [];

    // Determine relationship (supportive/contradictory) for each similar node
    const nodesWithRelationship = await Promise.all(
      similarNodes.map(async (node) => {
        const relationshipPrompt = `Analyze the relationship between these two statements:
          
Statement A: "${content}"
Statement B: "${node.title}: ${node.description || ''}"

Determine if Statement B is:
1. "supportive" - agrees with, builds upon, or supports Statement A
2. "contradictory" - disagrees with, opposes, or contradicts Statement A

Respond with just one word: "supportive" or "contradictory"`;

        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: 'You are analyzing argument relationships. Respond with only "supportive" or "contradictory".' },
                { role: 'user', content: relationshipPrompt }
              ],
              temperature: 0.1,
              max_tokens: 5
            })
          });

          const data = await response.json();
          const relationshipText = data.choices[0].message.content.trim().toLowerCase();
          const relationship = relationshipText.includes('supportive') ? 'supportive' : 'contradictory';
          
          return {
            id: node.id,
            title: node.title,
            description: node.description || '',
            nodeType: node.node_type,
            similarity: node.similarity,
            relationship,
            createdBy: {
              displayName: node.profiles?.display_name || 'Anonymous'
            }
          };
        } catch (error) {
          console.warn('Error determining relationship for node:', node.id, error);
          return {
            id: node.id,
            title: node.title,
            description: node.description || '',
            nodeType: node.node_type,
            similarity: node.similarity,
            relationship: 'supportive' as const,
            createdBy: {
              displayName: node.profiles?.display_name || 'Anonymous'
            }
          };
        }
      })
    );

    console.log(`✅ Found ${nodesWithRelationship.length} similar IBIS nodes`);
    return nodesWithRelationship;
  } catch (error) {
    console.error('❌ Error finding similar IBIS nodes:', error);
    return [];
  }
}

// Determine which agents should execute based on selection and similarities
function determineAgentsToExecute(selectedAgent: string, similarNodes: SimilarNode[]): string[] {
  const agents: string[] = [];
  
  // If similarities found, always include peer agent
  if (similarNodes.length > 0) {
    agents.push('peer_agent');
    
    // If another agent was selected, include it too
    if (selectedAgent !== 'peer_agent') {
      agents.push(selectedAgent);
    }
  } else {
    // No similarities, just use selected agent
    agents.push(selectedAgent);
  }
  
  return agents;
}

// Execute multiple agents in sequence
async function executeAgentResponses(
  agents: string[],
  context: OrchestrationContext,
  supabase: any,
  openAIApiKey: string,
  analysis: SemanticAnalysis
): Promise<string[]> {
  console.log(`🤖 Executing ${agents.length} agents:`, agents);
  
  const responses: string[] = [];
  
  for (const agentType of agents) {
    try {
      const response = await executeAgentResponse(agentType, context, supabase, openAIApiKey, analysis);
      responses.push(response);
      console.log(`✅ ${agentType} completed`);
    } catch (error) {
      console.error(`❌ ${agentType} failed:`, error);
      responses.push(''); // Add empty response to maintain order
    }
  }
  
  return responses;
}