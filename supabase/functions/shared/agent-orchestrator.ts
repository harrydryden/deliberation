// Unified Agent Orchestration Service
// Single source of truth for agent configuration, model selection, and prompt generation

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  agent_type: string;
  goals?: string[];
  response_style?: string;
  is_active: boolean;
  is_default: boolean;
  deliberation_id?: string;
  prompt_overrides?: {
    system_prompt?: string;
  };
  facilitator_config?: Record<string, any>;
  preferred_model?: string;
}

export interface AnalysisResult {
  intent: string;
  complexity: number;
  topicRelevance: number;
  requiresExpertise: boolean;
  confidence?: number;
}

export interface ConversationContext {
  messageCount: number;
  recentMessages: any[];
  lastAgentType?: string;
  userEngagement?: any;
}

// Agent configuration cache with 5-minute TTL
interface AgentCacheEntry {
  agent: AgentConfig | null;
  timestamp: number;
}

const agentConfigCache = new Map<string, AgentCacheEntry>();
const AGENT_CACHE_DURATION = 1000 * 60 * 5; // 5 minutes
const MAX_AGENT_CACHE_SIZE = 100;

export class AgentOrchestrator {
  private supabase: any;
  
  constructor(supabase: any) {
    this.supabase = supabase;
  }

  // Standardized model selection - always use flagship model
  selectOptimalModel(analysis: AnalysisResult, agentConfig?: AgentConfig): string {
    // Check agent-specific model preference first
    if (agentConfig?.preferred_model) {
      return agentConfig.preferred_model;
    }
    
    // Always use best model available
    return 'gpt-5-2025-08-07';
  }

  // UNIFIED AGENT CONFIGURATION FETCHING
  async getAgentConfig(agentType: string, deliberationId?: string): Promise<AgentConfig | null> {
    const cacheKey = `${agentType}:${deliberationId || 'global'}`;
    
    // Check cache first
    const cached = agentConfigCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < AGENT_CACHE_DURATION) {
      console.log(`🚀 Agent config cache hit: ${agentType}`);
      return cached.agent;
    }
    
    console.log(`🔄 Fetching agent config: ${agentType} for deliberation: ${deliberationId}`);
    
    try {
      let agentConfig: AgentConfig | null = null;

      // Step 1: Try local agent for this deliberation
      if (deliberationId) {
        const { data: localAgent, error: localError } = await this.supabase
          .from('agent_configurations')
          .select('*')
          .eq('deliberation_id', deliberationId)
          .eq('agent_type', agentType)
          .eq('is_active', true)
          .maybeSingle();
        
        if (localError) {
          console.warn(`Error fetching local ${agentType} agent:`, localError);
        }
        
        if (localAgent) {
          console.log(`✅ Found local ${agentType} agent`);
          agentConfig = localAgent;
        }
      }
      
      // Step 2: Fallback to global agent
      if (!agentConfig) {
        console.log(`No local ${agentType} agent found, trying global agent`);
        const { data: globalAgent, error: globalError } = await this.supabase
          .from('agent_configurations')
          .select('*')
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
          agentConfig = globalAgent;
        }
      }
      
      // Cache the result (including null)
      this.cacheAgentConfig(cacheKey, agentConfig);
      
      return agentConfig;
      
    } catch (error) {
      console.error(`Failed to fetch ${agentType} agent configuration:`, error);
      // Cache null result to avoid repeated failures
      this.cacheAgentConfig(cacheKey, null);
      return null;
    }
  }

  // UNIFIED SYSTEM PROMPT GENERATION
  generateSystemPrompt(agentConfig: AgentConfig | null, agentType: string, context?: any): string {
    if (agentConfig?.prompt_overrides?.system_prompt) {
      // Use custom system prompt if available
      return this.enhancePromptWithContext(agentConfig.prompt_overrides.system_prompt, context);
    }
    
    if (agentConfig) {
      // Auto-generate from agent configuration
      let prompt = `You are ${agentConfig.name}`;
      
      if (agentConfig.description) {
        prompt += `, ${agentConfig.description}`;
      }
      
      if (agentConfig.goals?.length) {
        prompt += `\n\nYour goals are:\n${agentConfig.goals.map(g => `- ${g}`).join('\n')}`;
      }
      
      if (agentConfig.response_style) {
        prompt += `\n\nResponse style: ${agentConfig.response_style}`;
      }
      
      return this.enhancePromptWithContext(prompt, context);
    }
    
    // Fallback to standardized default prompts
    return this.enhancePromptWithContext(this.getDefaultSystemPrompt(agentType), context);
  }

  // ENHANCED AGENT SELECTION ALGORITHM
  async selectOptimalAgent(
    analysis: AnalysisResult, 
    conversationContext: ConversationContext,
    deliberationId?: string,
    availableKnowledge?: Record<string, boolean>
  ): Promise<string> {
    // Get available agent configurations for this deliberation
    const agentTypes = ['bill_agent', 'peer_agent', 'flow_agent'];
    const agentConfigs = new Map<string, AgentConfig | null>();
    
    // Fetch all agent configs in parallel
    const configPromises = agentTypes.map(async (type) => {
      const config = await this.getAgentConfig(type, deliberationId);
      agentConfigs.set(type, config);
      return { type, config };
    });
    
    await Promise.all(configPromises);
    
    const scores = {
      bill_agent: 0,
      peer_agent: 0,
      flow_agent: 0
    };

    // Enhanced scoring with agent configuration awareness
    const factors = {
      complexity: analysis.complexity || 0.5,
      requiresExpertise: analysis.requiresExpertise || false,
      intent: analysis.intent || 'general',
      topicRelevance: analysis.topicRelevance || 0.5,
      messageCount: conversationContext.messageCount || 0,
      recentMessageTypes: this.getRecentMessageTypes(conversationContext.recentMessages || []),
      hasKnowledge: availableKnowledge || {}
    };

    // Bill Agent scoring - enhanced with knowledge availability
    const billConfig = agentConfigs.get('bill_agent');
    if (billConfig?.is_active !== false) { // Only score if agent exists and is active
      scores.bill_agent += factors.complexity * 40;
      scores.bill_agent += factors.requiresExpertise ? 30 : 0;
      scores.bill_agent += factors.topicRelevance * 25;
      scores.bill_agent += factors.intent.includes('policy') ? 20 : 0;
      scores.bill_agent += factors.intent.includes('legal') ? 20 : 0;
      scores.bill_agent += factors.intent.includes('legislation') ? 25 : 0;
      scores.bill_agent += factors.hasKnowledge.bill_agent ? 15 : 0; // Boost if knowledge available
    }

    // Peer Agent scoring
    const peerConfig = agentConfigs.get('peer_agent');
    if (peerConfig?.is_active !== false) {
      scores.peer_agent += factors.messageCount > 5 ? 20 : 0;
      scores.peer_agent += factors.intent.includes('participant') ? 25 : 0;
      scores.peer_agent += factors.intent.includes('perspective') ? 20 : 0;
      scores.peer_agent += this.getRecentBillAgentCount(factors.recentMessageTypes) > 2 ? 15 : 0;
    }

    // Flow Agent scoring  
    const flowConfig = agentConfigs.get('flow_agent');
    if (flowConfig?.is_active !== false) {
      scores.flow_agent += factors.messageCount < 3 ? 25 : 0;
      scores.flow_agent += factors.intent.includes('question') ? 20 : 0;
      scores.flow_agent += factors.intent.includes('clarify') ? 25 : 0;
      scores.flow_agent += factors.complexity < 0.3 ? 15 : 0;
      scores.flow_agent += this.getRecentFlowAgentCount(factors.recentMessageTypes) === 0 ? 10 : 0;
    }

    // Anti-repetition logic
    const lastAgentType = this.getLastAgentType(factors.recentMessageTypes);
    if (lastAgentType && scores[lastAgentType as keyof typeof scores] !== undefined) {
      scores[lastAgentType as keyof typeof scores] -= 10;
    }

    // Select agent with highest score, defaulting to flow_agent
    const selectedAgent = Object.entries(scores).reduce((max, [agent, score]) => 
      score > max.score ? { agent, score } : max, 
      { agent: 'flow_agent', score: -1 }
    ).agent;

    console.log(`🔬 Enhanced agent scoring results:`, {
      scores,
      factors,
      selected: selectedAgent,
      availableConfigs: Object.fromEntries(
        Array.from(agentConfigs.entries()).map(([type, config]) => [type, !!config])
      )
    });

    return selectedAgent;
  }

  // UNIFIED MESSAGE ANALYSIS
  async analyzeMessage(content: string, openAIApiKey: string): Promise<AnalysisResult> {
    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔍 Message analysis attempt ${attempt}/${maxRetries} for content: "${content.substring(0, 100)}..."`);

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
                content: `You are an expert message analyser. Analyse the user's message and return ONLY a valid JSON object with these exact fields:
{
  "intent": "string (one of: policy, legal, legislation, participant, perspective, question, clarify, general)",
  "complexity": number (0.0 to 1.0),
  "topicRelevance": number (0.0 to 1.0),
  "requiresExpertise": boolean
}

Guidelines:
- complexity: How difficult/nuanced is this message? Simple greetings = 0.1, complex policy discussions = 0.9
- topicRelevance: How relevant to policy/legislation topics? Off-topic chat = 0.1, direct policy questions = 0.9
- intent: What is the user trying to do? Use specific categories when applicable
- requiresExpertise: Does this need specialized knowledge to answer properly?

Return ONLY the JSON, no explanations or markdown.`
              },
              {
                role: 'user',
                content: content.trim()
              }
            ],
            max_completion_tokens: 200,
            response_format: { type: "json_object" }
          }),
        });

        console.log(`📡 OpenAI API response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ OpenAI API error ${response.status}:`, errorText);
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const analysisContent = data.choices?.[0]?.message?.content;
        
        console.log(`📄 Raw analysis response:`, analysisContent);

        if (!analysisContent) {
          throw new Error('No analysis content received from OpenAI');
        }

        // Parse and validate the JSON response
        let parsedResult: any;
        try {
          parsedResult = JSON.parse(analysisContent);
        } catch (parseError) {
          console.error(`❌ JSON parse error:`, parseError);
          throw new Error(`Invalid JSON response: ${analysisContent}`);
        }

        // Validate required fields and types
        const result: AnalysisResult = {
          intent: this.validateIntent(parsedResult.intent) || 'general',
          complexity: this.validateNumber(parsedResult.complexity, 0, 1) ?? 0.5,
          topicRelevance: this.validateNumber(parsedResult.topicRelevance, 0, 1) ?? 0.5,
          requiresExpertise: Boolean(parsedResult.requiresExpertise)
        };

        console.log(`✅ Message analysis successful:`, result);
        return result;

      } catch (error) {
        lastError = error;
        console.error(`❌ Message analysis attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          console.log(`🔄 Retrying in ${attempt * 1000}ms...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    // All retries failed, return intelligent defaults based on content analysis
    console.error(`❌ All message analysis attempts failed, using intelligent defaults:`, lastError);
    return this.generateIntelligentDefaults(content);
  }

  private validateIntent(intent: any): string | null {
    const validIntents = ['policy', 'legal', 'legislation', 'participant', 'perspective', 'question', 'clarify', 'general'];
    if (typeof intent === 'string' && validIntents.includes(intent.toLowerCase())) {
      return intent.toLowerCase();
    }
    return null;
  }

  private validateNumber(value: any, min: number, max: number): number | null {
    const num = Number(value);
    if (!isNaN(num) && num >= min && num <= max) {
      return num;
    }
    return null;
  }

  private generateIntelligentDefaults(content: string): AnalysisResult {
    const lowerContent = content.toLowerCase();
    
    // Basic intent detection using keywords
    let intent = 'general';
    if (lowerContent.includes('policy') || lowerContent.includes('bill') || lowerContent.includes('legislation')) {
      intent = 'policy';
    } else if (lowerContent.includes('legal') || lowerContent.includes('law')) {
      intent = 'legal';  
    } else if (lowerContent.includes('what') || lowerContent.includes('how') || lowerContent.includes('?')) {
      intent = 'question';
    } else if (lowerContent.includes('other') || lowerContent.includes('participant') || lowerContent.includes('people')) {
      intent = 'participant';
    }

    // Basic complexity estimation
    let complexity = 0.3; // Lower default
    if (content.length > 200) complexity += 0.2;
    if (lowerContent.includes('complex') || lowerContent.includes('detailed') || lowerContent.includes('nuanced')) complexity += 0.3;
    if (content.split(' ').length > 50) complexity += 0.2;
    complexity = Math.min(complexity, 1.0);

    // Basic topic relevance
    let topicRelevance = 0.3; // Lower default
    if (intent === 'policy' || intent === 'legal') topicRelevance = 0.8;
    else if (lowerContent.includes('deliberation') || lowerContent.includes('discussion')) topicRelevance = 0.6;

    const result = {
      intent,
      complexity: Math.round(complexity * 100) / 100,
      topicRelevance: Math.round(topicRelevance * 100) / 100,
      requiresExpertise: intent === 'policy' || intent === 'legal' || complexity > 0.7
    };

    console.log(`🧠 Intelligent defaults generated:`, result);
    return result;
  }

  // CACHE MANAGEMENT
  private cacheAgentConfig(key: string, agent: AgentConfig | null): void {
    // Clean up cache if it's getting too large
    if (agentConfigCache.size >= MAX_AGENT_CACHE_SIZE) {
      this.cleanupAgentCache();
    }
    
    agentConfigCache.set(key, {
      agent,
      timestamp: Date.now()
    });
  }

  private cleanupAgentCache(): void {
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
      
      const toRemove = sortedEntries.slice(0, 20);
      keysToDelete.push(...toRemove.map(([key]) => key));
    }
    
    keysToDelete.forEach(key => agentConfigCache.delete(key));
    console.log(`🧹 Agent cache cleanup: removed ${keysToDelete.length} entries`);
  }

  // CACHE INVALIDATION
  invalidateAgentCache(agentType?: string, deliberationId?: string): void {
    if (agentType && deliberationId) {
      // Invalidate specific agent config
      const key = `${agentType}:${deliberationId}`;
      agentConfigCache.delete(key);
      // Also invalidate global version
      const globalKey = `${agentType}:global`;
      agentConfigCache.delete(globalKey);
    } else if (agentType) {
      // Invalidate all configs for this agent type
      for (const key of agentConfigCache.keys()) {
        if (key.startsWith(`${agentType}:`)) {
          agentConfigCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      agentConfigCache.clear();
    }
    console.log(`🔄 Invalidated agent cache: ${agentType || 'all'}`);
  }

  // PRIVATE HELPER METHODS
  private getDefaultSystemPrompt(agentType: string): string {
    const systemPrompts = {
      bill_agent: `You are the Bill Agent, a specialised AI facilitator for democratic deliberation. Your expertise lies in policy analysis, legislative frameworks, and the nuanced understanding of how laws and regulations impact society.

Your role is to provide factual, balanced information about policy matters, help clarify complex legislative issues, and guide participants toward evidence-based discussions about governance and policy implementation.

Key responsibilities:
- Analyse policy implications and legislative details
- Provide factual information about existing laws and regulations  
- Help participants understand the complexity of policy decisions
- Maintain political neutrality while being informative
- Guide discussions toward constructive policy dialogue`,

      peer_agent: `You are the Peer Agent called "Pia". You are a go-between for users/participants, as users cannot talk directly to one another. You capture the arguments and statements of any given participant once they have finished making their point and convert them into the IBIS format (Issues, Positions, Arguments) for structured deliberation.

Your role is to reflect back what participants have shared, identify patterns in the discussion, and help individuals understand how their views relate to others in the community.

Key responsibilities:
- Capture and convert participant statements into IBIS format
- Synthesise and reflect participant perspectives  
- Identify areas of consensus and divergence
- Share relevant insights from similar discussions
- Help participants see diverse viewpoints
- Foster empathy and understanding between different positions

Use British English spelling and grammar in all responses.`,

      flow_agent: `You are the Flow Agent, the facilitator and guide for this democratic deliberation. Your expertise is in conversation facilitation, engagement techniques, and helping participants navigate complex discussions productively.

Your role is to maintain healthy discussion flow, suggest productive directions for conversation, and help participants engage more deeply with the topics at hand.

Key responsibilities:
- Facilitate productive conversation flow
- Suggest discussion directions and frameworks
- Help participants engage more deeply
- Introduce relevant questions and perspectives  
- Guide toward constructive outcomes

Use British English spelling and grammar in all responses.`
    };

    return systemPrompts[agentType as keyof typeof systemPrompts] || systemPrompts.flow_agent;
  }

  private enhancePromptWithContext(prompt: string, context?: any): string {
    if (!context) return prompt;

    if (context.complexity > 0.7) {
      prompt += "\n\nThis is a complex query requiring detailed analysis and nuanced understanding.";
    }

    if (context.similarNodes?.length > 0) {
      prompt += `\n\nThere are ${context.similarNodes.length} related discussion points that may be relevant to reference.`;
    }

    if (context.knowledgeContext && context.knowledgeContext.length > 0) {
      prompt += `\n\nRELEVANT KNOWLEDGE CONTEXT:\n${context.knowledgeContext}\n\nUse this knowledge to inform your response when relevant, but always provide balanced and comprehensive information.`;
    }

    // Add British English instruction
    prompt += "\n\nUse British English spelling and grammar throughout your response.";

    return prompt;
  }

  private getRecentMessageTypes(messages: any[]): string[] {
    return messages.slice(0, 5).map(m => m.message_type || 'unknown');
  }

  private getRecentBillAgentCount(messageTypes: string[]): number {
    return messageTypes.filter(type => type === 'bill_agent').length;
  }

  private getRecentFlowAgentCount(messageTypes: string[]): number {
    return messageTypes.filter(type => type === 'flow_agent').length;
  }

  private getLastAgentType(messageTypes: string[]): string | null {
    return messageTypes.find(type => type !== 'user') || null;
  }
}