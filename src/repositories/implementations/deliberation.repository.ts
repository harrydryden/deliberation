import { supabase } from '@/integrations/supabase/client';
import { BaseRepository } from './base.repository';
import { IDeliberationRepository } from '../interfaces';
import { Deliberation } from '@/types/api';
import { logger } from '@/utils/logger';

export class DeliberationRepository extends BaseRepository<Deliberation> implements IDeliberationRepository {
  constructor() {
    super('deliberations');
  }

  async findByStatus(status: string): Promise<Deliberation[]> {
    try {
      const { data, error } = await supabase
        .from('deliberations')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error, status }, 'Deliberation repository findByStatus error');
        throw error;
      }

      return data as Deliberation[];
    } catch (error) {
      logger.error({ error, status }, 'Deliberation repository findByStatus failed');
      throw error;
    }
  }

  async findByFacilitator(facilitatorId: string): Promise<Deliberation[]> {
    try {
      const { data, error } = await supabase
        .from('deliberations')
        .select('*')
        .eq('facilitator_id', facilitatorId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error, facilitatorId }, 'Deliberation repository findByFacilitator error');
        throw error;
      }

      return data as Deliberation[];
    } catch (error) {
      logger.error({ error, facilitatorId }, 'Deliberation repository findByFacilitator failed');
      throw error;
    }
  }

  async findPublic(): Promise<Deliberation[]> {
    try {
      const { data, error } = await supabase
        .from('deliberations')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, 'Deliberation repository findPublic error');
        throw error;
      }

      return data as Deliberation[];
    } catch (error) {
      logger.error({ error }, 'Deliberation repository findPublic failed');
      throw error;
    }
  }

  // Override findAll to include proper joins and filtering
  async findAll(filter?: Record<string, any>): Promise<Deliberation[]> {
    try {
      let query = supabase
        .from('deliberations')
        .select(`
          id,
          title,
          description,
          notion,
          status,
          facilitator_id,
          start_time,
          end_time,
          max_participants,
          is_public,
          created_at,
          updated_at,
          participants:participants(id, user_id)
        `);

      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        logger.error({ error, filter }, 'Deliberation repository findAll error');
        throw error;
      }

      // Get current user ID for participation check
      const currentUserId = JSON.parse(localStorage.getItem('simple_auth_user') || '{}').id;

      // Map database format to API format with participant info
      return data.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description,
        notion: item.notion,
        status: item.status,
        facilitator_id: item.facilitator_id,
        start_time: item.start_time,
        end_time: item.end_time,
        max_participants: item.max_participants,
        is_public: item.is_public,
        created_at: item.created_at,
        createdAt: item.created_at,
        updated_at: item.updated_at,
        updatedAt: item.updated_at,
        participant_count: Array.isArray(item.participants) ? item.participants.length : 0,
        is_user_participant: Array.isArray(item.participants) ? 
          item.participants.some((p: any) => p.user_id === currentUserId) : false
      })) as Deliberation[];
    } catch (error) {
      logger.error({ error, filter }, 'Deliberation repository findAll failed');
      throw error;
    }
  }

  async joinDeliberation(deliberationId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('participants')
        .insert({
          deliberation_id: deliberationId,
          user_id: userId,
          role: 'participant'
        });

      if (error && error.code !== '23505') { // Ignore duplicate key error
        logger.error({ error, deliberationId, userId }, 'Failed to join deliberation');
        throw error;
      }

      logger.info('User joined deliberation successfully', { deliberationId, userId });
    } catch (error) {
      logger.error({ error, deliberationId, userId }, 'Join deliberation failed');
      throw error;
    }
  }
}