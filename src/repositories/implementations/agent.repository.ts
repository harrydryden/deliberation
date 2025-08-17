import { supabase } from '@/integrations/supabase/client';
import { BaseRepository } from './base.repository';
import { IAgentRepository } from '../interfaces';
import { Agent } from '@/types/api';
import { logger } from '@/utils/logger';

export class AgentRepository extends BaseRepository<Agent> implements IAgentRepository {
  constructor() {
    super('agent_configurations');
  }

  async findByDeliberation(deliberationId: string): Promise<Agent[]> {
    try {
      const { data, error } = await supabase
        .from('agent_configurations')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .eq('is_active', true);

      if (error) {
        logger.error({ error, deliberationId }, 'Agent repository findByDeliberation error');
        throw error;
      }

      // Map database format to API format
      return data.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        system_prompt: item.system_prompt,
        response_style: item.response_style,
        goals: item.goals,
        agent_type: item.agent_type,
        facilitator_config: item.facilitator_config,
        is_default: item.is_default,
        isActive: item.is_active,
        deliberation_id: item.deliberation_id,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })) as Agent[];
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
        system_prompt: item.system_prompt,
        response_style: item.response_style,
        goals: item.goals,
        agent_type: item.agent_type,
        facilitator_config: item.facilitator_config,
        is_default: item.is_default,
        isActive: item.is_active,
        deliberation_id: item.deliberation_id,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
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
          system_prompt,
          goals,
          response_style,
          is_active,
          is_default,
          deliberation_id,
          created_by,
          created_at,
          updated_at,
          preset_questions,
          facilitator_config
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
        system_prompt: item.system_prompt,
        response_style: item.response_style,
        goals: item.goals,
        agent_type: item.agent_type,
        facilitator_config: item.facilitator_config,
        is_default: item.is_default,
        isActive: item.is_active,
        deliberation_id: item.deliberation_id,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
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
          system_prompt,
          goals,
          response_style,
          is_active,
          is_default,
          deliberation_id,
          created_by,
          created_at,
          updated_at,
          preset_questions,
          facilitator_config
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
        system_prompt: item.system_prompt,
        response_style: item.response_style,
        goals: item.goals,
        agent_type: item.agent_type,
        facilitator_config: item.facilitator_config,
        is_default: item.is_default,
        isActive: item.is_active,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })) as Agent[];
    } catch (error) {
      logger.error({ error, filter }, 'Agent repository findAll failed');
      throw error;
    }
  }
}