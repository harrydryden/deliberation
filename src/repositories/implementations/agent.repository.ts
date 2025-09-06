import { supabase } from '@/integrations/supabase/client';
import { SupabaseBaseRepository } from './supabase-base.repository';
import { IAgentRepository } from '../interfaces';
import { Agent } from '@/types/index';
import { logger } from '@/utils/logger';

export class AgentRepository extends SupabaseBaseRepository implements IAgentRepository {
  
  async findById(id: string): Promise<Agent | null> {
    try {
      const { data, error } = await supabase
        .from('agent_configurations')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return this.mapToAgent(data);
    } catch (error) {
      logger.error('Agent repository findById failed', error as Error, { id });
      throw error;
    }
  }

  async create(data: any): Promise<Agent> {
    try {
      // Convert camelCase fields to snake_case for database
      const dbData: any = { ...data };
      
      // Map camelCase to snake_case
      if (data.deliberationId !== undefined) {
        dbData.deliberation_id = data.deliberationId;
        delete dbData.deliberationId;
      }
      
      if (data.isActive !== undefined) {
        dbData.is_active = data.isActive;
        delete dbData.isActive;
      }
      
      // Remove system_prompt handling - now using prompt templates
      
      // Automatically set created_by to current user
      const currentUserId = await this.getCurrentUserId();
      if (currentUserId) {
        dbData.created_by = currentUserId;
      }
      
      const { data: result, error } = await supabase
        .from('agent_configurations')
        .insert(dbData)
        .select()
        .single();
      
      if (error) throw error;
      
      return this.mapToAgent(result);
    } catch (error) {
      logger.error('Agent repository create failed', error as Error, { data });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    return this.deleteFromTable('agent_configurations', id);
  }

  private mapToAgent(data: any): Agent {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      agent_type: data.agent_type,
      goals: data.goals || [],
      response_style: data.response_style,
      is_active: data.is_active,
      is_default: data.is_default,
      deliberation_id: data.deliberation_id,
      created_by: data.created_by,
      created_at: data.created_at,
      preset_questions: data.preset_questions,
      facilitator_config: data.facilitator_config,
      prompt_overrides: data.prompt_overrides,
      deliberation: data.deliberation
    };
  }

  async findByDeliberation(deliberationId: string): Promise<Agent[]> {
    try {
      // Use admin function to get local agents (bypasses RLS for admin users)
      const { data: agentData, error: agentError } = await supabase
        .rpc('get_local_agents_admin');

      if (agentError) {
        logger.error('Agent repository findByDeliberation RPC error', agentError as Error, { deliberationId });
        throw agentError;
      }

      if (!agentData || agentData.length === 0) {
        return [];
      }

      // Filter for the specific deliberation and map to Agent format
      const filteredAgents = agentData
        .filter((item: any) => item.deliberation_id === deliberationId && item.is_active)
        .map((item: any) => this.mapToAgent(item));

      logger.info(`Agent repository findByDeliberation found ${filteredAgents.length} agents`, { 
        deliberationId, 
        agentTypes: filteredAgents.map(a => a.agent_type) 
      });

      return filteredAgents;
    } catch (error) {
      logger.error('Agent repository findByDeliberation failed', error as Error, { deliberationId });
      throw error;
    }
  }

  async findLocalAgents(): Promise<Agent[]> {
    try {
      // Use admin function to get local agents (bypasses RLS for admin users)
      const { data: agentData, error: agentError } = await supabase
        .rpc('get_local_agents_admin');

      if (agentError) {
        logger.error('Agent repository findLocalAgents RPC error', agentError as Error);
        throw agentError;
      }

      if (!agentData || agentData.length === 0) {
        return [];
      }

      // Get deliberation details for each agent
      const deliberationIds = agentData.map(agent => agent.deliberation_id).filter(Boolean);
      let deliberationMap = new Map();

      if (deliberationIds.length > 0) {
        const { data: deliberationData, error: deliberationError } = await supabase
          .from('deliberations')
          .select('id, title, status')
          .in('id', deliberationIds);

        if (deliberationError) {
          logger.error('Agent repository findLocalAgents deliberation error', deliberationError as Error);
          // Continue without deliberation data rather than failing completely
        } else {
          deliberationMap = new Map(
            (deliberationData || []).map(d => [d.id, d])
          );
        }
      }

      // Map database format to API format with consistent field mapping
      return agentData.map(item => ({
        ...this.mapToAgent(item),
        deliberation: item.deliberation_id && deliberationMap.has(item.deliberation_id) 
          ? deliberationMap.get(item.deliberation_id)
          : undefined
      }));
    } catch (error) {
      logger.error('Agent repository findLocalAgents failed', error as Error);
      throw error;
    }
  }

  async findGlobalAgents(): Promise<Agent[]> {
    try {
      const { data, error } = await supabase
        .from('agent_configurations')
        .select(`
          id,
          name,
          description,
          agent_type,
          goals,
          response_style,
          is_active,
          is_default,
          deliberation_id,
          created_by,
          created_at,
          preset_questions,
          facilitator_config,
          prompt_overrides
        `)
        .is('deliberation_id', null);

      if (error) {
        logger.error('Agent repository findGlobalAgents error', error as Error);
        throw error;
      }

      // Map database format to API format
      return data.map(item => this.mapToAgent(item));
    } catch (error) {
      logger.error('Agent repository findGlobalAgents failed', error as Error);
      throw error;
    }
  }

  // Override findAll to include proper filtering
  async findAll(filter?: Record<string, any>): Promise<Agent[]> {
    try {
      let query = supabase
        .from('agent_configurations')
        .select(`
          id,
          name,
          description,
          agent_type,
          goals,
          response_style,
          is_active,
          is_default,
          deliberation_id,
          created_by,
          created_at,
          preset_questions,
          facilitator_config,
          prompt_overrides
        `);

      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          if (value === null) {
            query = query.is(key, null);
          } else if (value === 'not_null') {
            query = query.not(key, 'is', null);
          } else {
            query = query.eq(key, value);
          }
        });
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Agent repository findAll error', error as Error, { filter });
        throw error;
      }

      // Map database format to API format
      return data.map(item => this.mapToAgent(item));
    } catch (error) {
      logger.error('Agent repository findAll failed', error as Error, { filter });
      throw error;
    }
  }

  // Override update to use admin function for agent configuration updates
  async update(id: string, data: Partial<Agent>): Promise<Agent> {
    try {
      // Convert camelCase fields to snake_case for database
      const dbData: any = { ...data };
      
      // Map camelCase to snake_case
      if (data.is_active !== undefined) {
        dbData.is_active = data.is_active;
      }
      
      // Use admin function for agent configuration updates
      const { data: result, error } = await supabase
        .rpc('admin_update_agent_configuration', {
          p_agent_id: id,
          p_updates: dbData
        });
      
      if (error) {
        logger.error('Agent repository admin update RPC error', error as Error, { id, data });
        throw error;
      }
      
      if (!result || result.length === 0) {
        throw new Error('Agent configuration update returned no results');
      }
      
      // Fetch the updated agent configuration to return full object
      const updatedAgent = await this.findById(id);
      
      if (!updatedAgent) {
        throw new Error('Could not retrieve updated agent configuration');
      }
      
      logger.info('Agent repository update successful', { id, updatedFields: Object.keys(data) });
      return updatedAgent;
    } catch (error) {
      logger.error('Agent repository update failed', error as Error, { id, data });
      throw error;
    }
  }
}