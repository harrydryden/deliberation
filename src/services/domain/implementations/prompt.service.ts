import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export interface PromptTemplate {
  id: string;
  prompt_type: string;
  agent_type?: string;
  name: string;
  template: string;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export class PromptService {
  async getPromptTemplates(filter?: {
    prompt_type?: string;
    agent_type?: string;
    is_default?: boolean;
  }): Promise<PromptTemplate[]> {
    try {
      let query = supabase
        .from('prompt_templates')
        .select('*')
        .eq('is_active', true)
        .order('prompt_type, agent_type, name');

      if (filter?.prompt_type) {
        query = query.eq('prompt_type', filter.prompt_type);
      }
      if (filter?.agent_type) {
        query = query.eq('agent_type', filter.agent_type);
      }
      if (filter?.is_default !== undefined) {
        query = query.eq('is_default', filter.is_default);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to fetch prompt templates', { error, filter });
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('Prompt service getPromptTemplates failed', { error, filter });
      throw error;
    }
  }

  async getDefaultPrompt(promptType: string, agentType?: string): Promise<string | null> {
    try {
      // First try to get agent-specific default prompt
      if (agentType) {
        const { data } = await supabase
          .from('prompt_templates')
          .select('template')
          .eq('prompt_type', promptType)
          .eq('agent_type', agentType)
          .eq('is_default', true)
          .eq('is_active', true)
          .single();

        if (data?.template) {
          return data.template;
        }
      }

      // Fall back to global default prompt
      const { data } = await supabase
        .from('prompt_templates')
        .select('template')
        .eq('prompt_type', promptType)
        .is('agent_type', null)
        .eq('is_default', true)
        .eq('is_active', true)
        .single();

      return data?.template || null;
    } catch (error) {
      logger.error('Failed to get default prompt', { error, promptType, agentType });
      return null;
    }
  }

  async getAgentPrompt(agentId: string, promptType: string, agentType: string): Promise<string> {
    try {
      // First check for agent-specific overrides
      const { data: agentConfig } = await supabase
        .from('agent_configurations')
        .select('prompt_overrides')
        .eq('id', agentId)
        .single();

      if (agentConfig?.prompt_overrides?.[promptType]) {
        return agentConfig.prompt_overrides[promptType];
      }

      // Fall back to default prompt for agent type
      const defaultPrompt = await this.getDefaultPrompt(promptType, agentType);
      if (defaultPrompt) {
        return defaultPrompt;
      }

      // Final fallback to hardcoded defaults
      return this.getHardcodedFallback(promptType, agentType);
    } catch (error) {
      logger.error('Failed to get agent prompt', { error, agentId, promptType, agentType });
      return this.getHardcodedFallback(promptType, agentType);
    }
  }

  async createPromptTemplate(template: Omit<PromptTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<PromptTemplate> {
    try {
      const { data, error } = await supabase
        .from('prompt_templates')
        .insert(template)
        .select()
        .single();

      if (error) {
        logger.error('Failed to create prompt template', { error, template });
        throw error;
      }

      logger.info('Prompt template created successfully', { templateId: data.id, name: template.name });
      return data;
    } catch (error) {
      logger.error('Prompt service createPromptTemplate failed', { error, template });
      throw error;
    }
  }

  async updatePromptTemplate(id: string, updates: Partial<PromptTemplate>): Promise<PromptTemplate> {
    try {
      const { data, error } = await supabase
        .from('prompt_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update prompt template', { error, id, updates });
        throw error;
      }

      logger.info('Prompt template updated successfully', { templateId: id });
      return data;
    } catch (error) {
      logger.error('Prompt service updatePromptTemplate failed', { error, id, updates });
      throw error;
    }
  }

  async updateAgentPromptOverride(agentId: string, promptType: string, promptText: string): Promise<void> {
    try {
      // Get current overrides
      const { data: currentConfig } = await supabase
        .from('agent_configurations')
        .select('prompt_overrides')
        .eq('id', agentId)
        .single();

      const currentOverrides = currentConfig?.prompt_overrides || {};
      const updatedOverrides = {
        ...currentOverrides,
        [promptType]: promptText
      };

      const { error } = await supabase
        .from('agent_configurations')
        .update({ prompt_overrides: updatedOverrides })
        .eq('id', agentId);

      if (error) {
        logger.error('Failed to update agent prompt override', { error, agentId, promptType });
        throw error;
      }

      logger.info('Agent prompt override updated successfully', { agentId, promptType });
    } catch (error) {
      logger.error('Prompt service updateAgentPromptOverride failed', { error, agentId, promptType });
      throw error;
    }
  }

  private getHardcodedFallback(promptType: string, agentType?: string): string {
    // Hardcoded fallbacks in case database is unavailable
    if (promptType === 'system_prompt') {
      switch (agentType) {
        case 'bill_agent':
          return 'You are the Bill Agent, a specialized AI facilitator for democratic deliberation.';
        case 'peer_agent':
          return 'You are the Peer Agent, representing diverse perspectives in democratic deliberation.';
        case 'flow_agent':
          return 'You are the Flow Agent acting as a facilitator in democratic deliberation.';
        default:
          return 'You are an AI assistant helping with democratic deliberation.';
      }
    }

    if (promptType === 'classification_prompt') {
      return 'Classify the following message: {content}';
    }

    if (promptType === 'ibis_generation_prompt') {
      return 'Generate root issues for deliberation on: {title}';
    }

    return 'You are a helpful AI assistant.';
  }
}

export const promptService = new PromptService();