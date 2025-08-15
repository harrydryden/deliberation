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

      return data as Agent[];
    } catch (error) {
      logger.error({ error, deliberationId }, 'Agent repository findByDeliberation failed');
      throw error;
    }
  }

  async findLocalAgents(): Promise<Agent[]> {
    try {
      const { data, error } = await supabase
        .from('agent_configurations')
        .select('*')
        .not('deliberation_id', 'is', null)
        .eq('is_active', true);

      if (error) {
        logger.error({ error }, 'Agent repository findLocalAgents error');
        throw error;
      }

      return data as Agent[];
    } catch (error) {
      logger.error({ error }, 'Agent repository findLocalAgents failed');
      throw error;
    }
  }

  async findGlobalAgents(): Promise<Agent[]> {
    try {
      const { data, error } = await supabase
        .from('agent_configurations')
        .select('*')
        .is('deliberation_id', null)
        .eq('is_active', true);

      if (error) {
        logger.error({ error }, 'Agent repository findGlobalAgents error');
        throw error;
      }

      return data as Agent[];
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

      return data as Agent[];
    } catch (error) {
      logger.error({ error, filter }, 'Agent repository findAll failed');
      throw error;
    }
  }
}