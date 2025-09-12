// Cache invalidation service for agent configurations and responses
// Ensures cache coherency when configurations change

import { createClient } from '@supabase/supabase-js';

export class CacheInvalidationService {
  private supabase: any;
  private subscribers: Map<string, ((type: string, key?: string) => void)[]> = new Map();

  constructor(supabase: any) {
    this.supabase = supabase;
    this.setupRealtimeListeners();
  }

  // Setup real-time listeners for cache invalidation
  private setupRealtimeListeners(): void {
    // Listen for agent configuration changes
    this.supabase
      .channel('agent_config_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'agent_configurations' 
        }, 
        (payload: any) => {
          console.log('🔄 Agent configuration changed, invalidating caches:', payload);
          this.invalidateAgentCaches(payload);
        }
      )
      .subscribe();

    // Listen for prompt template changes
    this.supabase
      .channel('prompt_template_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'prompt_templates' 
        }, 
        (payload: any) => {
          console.log('🔄 Prompt template changed, invalidating caches:', payload);
          this.invalidatePromptCaches(payload);
        }
      )
      .subscribe();

    // Listen for agent knowledge changes
    this.supabase
      .channel('agent_knowledge_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'agent_knowledge' 
        }, 
        (payload: any) => {
          console.log('🔄 Agent knowledge changed, invalidating related caches:', payload);
          this.invalidateKnowledgeCaches(payload);
        }
      )
      .subscribe();
  }

  // Subscribe to cache invalidation events
  subscribe(eventType: string, callback: (type: string, key?: string) => void): void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType)!.push(callback);
  }

  // Notify subscribers about cache invalidation
  private notify(eventType: string, key?: string): void {
    const callbacks = this.subscribers.get(eventType) || [];
    callbacks.forEach(callback => {
      try {
        callback(eventType, key);
      } catch (error) {
        console.error('Cache invalidation callback error:', error);
      }
    });
  }

  // Handle agent configuration changes
  private invalidateAgentCaches(payload: any): void {
    const { new: newRecord, old: oldRecord, eventType } = payload;
    const record = newRecord || oldRecord;
    
    if (!record) return;

    const agentType = record.agent_type;
    const deliberationId = record.deliberation_id;

    // Notify all cache systems to invalidate agent configs
    this.notify('agent_config_changed', `${agentType}:${deliberationId || 'global'}`);
    
    // Also invalidate response caches that might be affected
    this.notify('response_cache_invalidate', `agent:${agentType}`);

    console.log(`🧹 Invalidated caches for agent: ${agentType}, deliberation: ${deliberationId || 'global'}`);
  }

  // Handle prompt template changes
  private invalidatePromptCaches(payload: any): void {
    const { new: newRecord, old: oldRecord } = payload;
    const record = newRecord || oldRecord;
    
    if (!record) return;

    // Invalidate all agent configs since prompt templates can affect system prompts
    this.notify('prompt_template_changed', record.name);
    this.notify('agent_config_invalidate_all');
    
    console.log(`🧹 Invalidated all agent caches due to prompt template change: ${record.name}`);
  }

  // Handle agent knowledge changes
  private invalidateKnowledgeCaches(payload: any): void {
    const { new: newRecord, old: oldRecord } = payload;
    const record = newRecord || oldRecord;
    
    if (!record) return;

    // Invalidate knowledge-related caches
    this.notify('knowledge_changed', record.agent_id);
    
    // Also invalidate response caches for bill agent (most likely to use knowledge)
    this.notify('response_cache_invalidate', 'agent:bill_agent');

    console.log(`🧹 Invalidated knowledge caches for agent: ${record.agent_id}`);
  }

  // Manual cache invalidation
  invalidateAgent(agentType: string, deliberationId?: string): void {
    this.notify('agent_config_changed', `${agentType}:${deliberationId || 'global'}`);
  }

  invalidateAllAgents(): void {
    this.notify('agent_config_invalidate_all');
  }

  invalidateResponseCache(key?: string): void {
    this.notify('response_cache_invalidate', key);
  }
}

// Global cache invalidation service instance
let globalInvalidationService: CacheInvalidationService | null = null;

export function getCacheInvalidationService(supabase?: any): CacheInvalidationService {
  if (!globalInvalidationService && supabase) {
    globalInvalidationService = new CacheInvalidationService(supabase);
  }
  return globalInvalidationService!;
}