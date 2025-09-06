// Unified Agent Service - Frontend integration with orchestrator
import { IAgentService } from '../interfaces';
import { IAgentRepository } from '@/repositories/interfaces';
import { Agent } from '@/types/index';
import { logger } from '@/utils/logger';
import { supabase } from '@/integrations/supabase/client';

// Cache invalidation integration for frontend
class FrontendCacheManager {
  private cacheInvalidationCallbacks: Map<string, (() => void)[]> = new Map();

  // Subscribe to cache invalidation events
  subscribeToInvalidation(eventType: string, callback: () => void): void {
    if (!this.cacheInvalidationCallbacks.has(eventType)) {
      this.cacheInvalidationCallbacks.set(eventType, []);
    }
    this.cacheInvalidationCallbacks.get(eventType)!.push(callback);
  }

  // Notify subscribers about cache invalidation
  notifyInvalidation(eventType: string): void {
    const callbacks = this.cacheInvalidationCallbacks.get(eventType) || [];
    callbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        logger.error('Cache invalidation callback error', { error });
      }
    });
  }

  // Setup real-time listeners for agent configuration changes
  setupRealtimeInvalidation(): void {
    supabase
      .channel('frontend_agent_cache_invalidation')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'agent_configurations' 
        }, 
        (payload: any) => {
          logger.info('Agent configuration changed, invalidating frontend caches', { payload });
          this.notifyInvalidation('agent_config_changed');
        }
      )
      .subscribe();

    supabase
      .channel('frontend_prompt_cache_invalidation')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'prompt_templates' 
        }, 
        (payload: any) => {
          logger.info('Prompt template changed, invalidating frontend caches', { payload });
          this.notifyInvalidation('prompt_template_changed');
        }
      )
      .subscribe();
  }
}

export class UnifiedAgentService implements IAgentService {
  private agentRepository: IAgentRepository;
  private cacheManager: FrontendCacheManager;
  private promptCache = new Map<string, { prompt: string; timestamp: number }>();
  private readonly CACHE_DURATION = 1000 * 60 * 5; // 5 minutes

  constructor(agentRepository: IAgentRepository) {
    this.agentRepository = agentRepository;
    this.cacheManager = new FrontendCacheManager();
    this.setupCacheInvalidation();
  }

  private setupCacheInvalidation(): void {
    // Setup real-time invalidation
    this.cacheManager.setupRealtimeInvalidation();

    // Subscribe to invalidation events
    this.cacheManager.subscribeToInvalidation('agent_config_changed', () => {
      this.clearPromptCache();
      logger.info('Agent configuration cache invalidated');
    });

    this.cacheManager.subscribeToInvalidation('prompt_template_changed', () => {
      this.clearPromptCache();
      logger.info('Prompt template cache invalidated');
    });
  }

  // UNIFIED SYSTEM PROMPT GENERATION (matches backend orchestrator)
  generateSystemPrompt(agent: Agent): string {
    const cacheKey = `${agent.id || agent.agent_type}-${JSON.stringify(agent.prompt_overrides)}`;
    
    // Check cache first
    const cached = this.promptCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
      return cached.prompt;
    }

    let prompt: string;

    // Check for manual override first
    if (agent.prompt_overrides?.system_prompt) {
      prompt = agent.prompt_overrides.system_prompt;
    } else {
      // Auto-generate from agent configuration (matching backend logic)
      prompt = `You are ${agent.name}`;
      
      if (agent.description) {
        prompt += `, ${agent.description}`;
      }
      
      if (agent.goals?.length) {
        prompt += `\n\nYour goals are:\n${agent.goals.map(g => `- ${g}`).join('\n')}`;
      }
      
      if (agent.response_style) {
        prompt += `\n\nResponse style: ${agent.response_style}`;
      }
      
      // Add fallback based on agent type if prompt is too short
      if (prompt.length < 50) {
        prompt += this.getSystemPromptFallback(agent.agent_type);
      }
    }

    // Cache the result
    this.promptCache.set(cacheKey, { prompt, timestamp: Date.now() });

    return prompt;
  }

  private getSystemPromptFallback(agentType: string): string {
    const fallbacks = {
      bill_agent: `

You are the Bill Agent, a specialized AI facilitator for democratic deliberation. Your expertise lies in policy analysis, legislative frameworks, and the nuanced understanding of how laws and regulations impact society.

Your role is to provide factual, balanced information about policy matters, help clarify complex legislative issues, and guide participants toward evidence-based discussions about governance and policy implementation.

Key responsibilities:
- Analyze policy implications and legislative details
- Provide factual information about existing laws and regulations  
- Help participants understand the complexity of policy decisions
- Maintain political neutrality while being informative
- Guide discussions toward constructive policy dialogue`,

      peer_agent: `

You are the Peer Agent, representing the collective voice and diverse perspectives within this democratic deliberation. You synthesize different viewpoints, highlight areas of consensus and disagreement, and help participants see the broader landscape of opinions.

Your role is to reflect back what participants have shared, identify patterns in the discussion, and help individuals understand how their views relate to others in the community.

Key responsibilities:
- Synthesize and reflect participant perspectives  
- Identify areas of consensus and divergence
- Share relevant insights from similar discussions
- Help participants see diverse viewpoints
- Foster empathy and understanding between different positions`,

      flow_agent: `

You are the Flow Agent, the facilitator and guide for this democratic deliberation. Your expertise is in conversation facilitation, engagement techniques, and helping participants navigate complex discussions productively.

Your role is to maintain healthy discussion flow, suggest productive directions for conversation, and help participants engage more deeply with the topics at hand.

Key responsibilities:
- Facilitate productive conversation flow
- Suggest discussion directions and frameworks
- Help participants engage more deeply
- Introduce relevant questions and perspectives  
- Guide toward constructive outcomes`
    };

    return fallbacks[agentType as keyof typeof fallbacks] || fallbacks.flow_agent;
  }

  private clearPromptCache(): void {
    this.promptCache.clear();
    logger.info('Prompt cache cleared');
  }

  // ENHANCED CRUD OPERATIONS WITH CACHE INVALIDATION
  async createAgent(agent: Omit<Agent, 'id' | 'created_at' | 'updated_at'>): Promise<Agent> {
    try {
      const createdAgent = await this.agentRepository.create(agent);
      
      // Invalidate caches
      this.cacheManager.notifyInvalidation('agent_config_changed');
      
      logger.info('Agent created successfully', { 
        agentId: createdAgent.id, 
        name: createdAgent.name,
        type: createdAgent.agent_type 
      });
      
      return createdAgent;
    } catch (error) {
      logger.error('Agent service createAgent failed', { error, agentName: agent.name });
      throw error;
    }
  }

  async updateAgent(id: string, agent: Partial<Agent>): Promise<Agent> {
    try {
      const updatedAgent = await this.agentRepository.update(id, agent);
      
      // Invalidate caches
      this.cacheManager.notifyInvalidation('agent_config_changed');
      
      logger.info('Agent updated successfully', { 
        agentId: id, 
        updatedFields: Object.keys(agent) 
      });
      
      return updatedAgent;
    } catch (error) {
      logger.error('Agent service updateAgent failed', { error, agentId: id });
      throw error;
    }
  }

  async deleteAgent(id: string): Promise<void> {
    try {
      await this.agentRepository.delete(id);
      
      // Invalidate caches
      this.cacheManager.notifyInvalidation('agent_config_changed');
      
      logger.info('Agent deleted successfully', { agentId: id });
    } catch (error) {
      logger.error('Agent service deleteAgent failed', { error, agentId: id });
      throw error;
    }
  }

  // DELEGATE OTHER METHODS TO EXISTING REPOSITORY
  async getAgents(filter?: Record<string, any>): Promise<Agent[]> {
    try {
      return await this.agentRepository.findAll(filter);
    } catch (error) {
      logger.error('Agent service getAgents failed', { error, filter });
      throw error;
    }
  }

  async getLocalAgents(): Promise<Agent[]> {
    try {
      return await this.agentRepository.findLocalAgents();
    } catch (error) {
      logger.error('Agent service getLocalAgents failed', { error });
      throw error;
    }
  }

  async getGlobalAgents(): Promise<Agent[]> {
    try {
      return await this.agentRepository.findGlobalAgents();
    } catch (error) {
      logger.error('Agent service getGlobalAgents failed', { error });
      throw error;
    }
  }

  async getAgentsByDeliberation(deliberationId: string): Promise<Agent[]> {
    try {
      return await this.agentRepository.findByDeliberation(deliberationId);
    } catch (error) {
      logger.error('Agent service getAgentsByDeliberation failed', { error, deliberationId });
      throw error;
    }
  }

  // GET CACHE STATISTICS
  getCacheStats() {
    return {
      promptCacheSize: this.promptCache.size,
      cacheDuration: this.CACHE_DURATION
    };
  }
}