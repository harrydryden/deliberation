import { supabase } from '@/integrations/supabase/client';
import { SupabaseBaseRepository } from './supabase-base.repository';
import { IAgentRepository } from '../interfaces';
import { Agent } from '@/types/api';
import { logger } from '@/utils/logger';

export class AgentRepository extends SupabaseBaseRepository implements IAgentRepository {
  
  async findById(id: string): Promise<Agent | null> {
    return this.findByIdFromTable('agent_configurations', id);
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
      
      const result = await this.createInTable('agent_configurations', dbData);
      
      // Map result back to camelCase for API consistency
      return {
        ...result,
        is_active: result.is_active,
        deliberation_id: result.deliberation_id,
      } as Agent;
    } catch (error) {
      logger.error({ error, data }, 'Agent repository create failed');
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    return this.deleteFromTable('agent_configurations', id);
  }

  async findByDeliberation(deliberationId: string): Promise<Agent[]> {
    try {
      // Use admin function to get local agents (bypasses RLS for admin users)
      const { data: agentData, error: agentError } = await supabase
        .rpc('get_local_agents_admin');

      if (agentError) {
        logger.error({ error: agentError, deliberationId }, 'Agent repository findByDeliberation RPC error');
        throw agentError;
      }

      if (!agentData || agentData.length === 0) {
        return [];
      }

      // Filter for the specific deliberation and map to Agent format
      const filteredAgents = agentData
        .filter((item: any) => item.deliberation_id === deliberationId && item.is_active)
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          response_style: item.response_style,
          goals: item.goals,
          agent_type: item.agent_type,
          facilitator_config: item.facilitator_config,
          is_default: item.is_default,
          is_active: item.is_active,
          deliberation_id: item.deliberation_id,
          created_at: item.created_at,
          updated_at: item.updated_at,
          prompt_overrides: item.prompt_overrides,
        })) as Agent[];

      logger.info(`Agent repository findByDeliberation found ${filteredAgents.length} agents`, { 
        deliberationId, 
        agentTypes: filteredAgents.map(a => a.agent_type) 
      });

      return filteredAgents;
    } catch (error) {
      logger.error({ error, deliberationId }, 'Agent repository findByDeliberation failed');
      throw error;
    }
  }

  async findLocalAgents(): Promise<Agent[]> {
    try {
      // Use admin function to get local agents (bypasses RLS for admin users)
      const { data: agentData, error: agentError } = await supabase
        .rpc('get_local_agents_admin');

      if (agentError) {
        logger.error({ error: agentError }, 'Agent repository findLocalAgents RPC error');
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
          logger.error({ error: deliberationError }, 'Agent repository findLocalAgents deliberation error');
          // Continue without deliberation data rather than failing completely
        } else {
          deliberationMap = new Map(
            (deliberationData || []).map(d => [d.id, d])
          );
        }
      }

      // Map database format to API format with consistent field mapping
      return agentData.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        response_style: item.response_style,
        goals: item.goals,
        agent_type: item.agent_type,
        facilitator_config: item.facilitator_config,
        is_default: item.is_default,
        is_active: item.is_active,
        deliberation_id: item.deliberation_id,
        created_at: item.created_at,
        updated_at: item.updated_at,
        prompt_overrides: item.prompt_overrides,
        deliberation: item.deliberation_id && deliberationMap.has(item.deliberation_id) 
          ? deliberationMap.get(item.deliberation_id)
          : undefined
      })) as Agent[];
    } catch (error) {
      logger.error({ error }, 'Agent repository findLocalAgents failed');
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
          updated_at,
          preset_questions,
          facilitator_config,
          prompt_overrides
        `)
        .is('deliberation_id', null);

      if (error) {
        logger.error({ error }, 'Agent repository findGlobalAgents error');
        throw error;
      }

      // Map database format to API format
      return data.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        response_style: item.response_style,
        goals: item.goals,
        agent_type: item.agent_type,
        facilitator_config: item.facilitator_config,
        is_default: item.is_default,
        is_active: item.is_active,
        deliberation_id: item.deliberation_id,
        created_at: item.created_at,
        updated_at: item.updated_at,
        prompt_overrides: item.prompt_overrides,
      })) as Agent[];
    } catch (error) {
      logger.error({ error }, 'Agent repository findGlobalAgents failed');
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
          updated_at,
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
        logger.error({ error, filter }, 'Agent repository findAll error');
        throw error;
      }

      // Map database format to API format
      return data.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        response_style: item.response_style,
        goals: item.goals,
        agent_type: item.agent_type,
        facilitator_config: item.facilitator_config,
        is_default: item.is_default,
        is_active: item.is_active,
        created_at: item.created_at,
        updated_at: item.updated_at,
        prompt_overrides: item.prompt_overrides,
      })) as Agent[];
    } catch (error) {
      logger.error({ error, filter }, 'Agent repository findAll failed');
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
        logger.error({ error, id, data }, 'Agent repository admin update RPC error');
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
      logger.error({ error, id, data }, 'Agent repository update failed');
      throw error;
    }
  }
}