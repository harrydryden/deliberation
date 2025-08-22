import { supabase } from '@/integrations/supabase/client';
import { SupabaseBaseRepository } from './supabase-base.repository';
import { IDeliberationRepository } from '../interfaces';
import { Deliberation } from '@/types/index';
import { logger } from '@/utils/logger';

export class DeliberationRepository extends SupabaseBaseRepository implements IDeliberationRepository {
  
  async findById(id: string): Promise<Deliberation | null> {
    return this.findByIdFromTable('deliberations', id);
  }

  async create(data: any): Promise<Deliberation> {
    return this.createInTable('deliberations', data);
  }

  async update(id: string, data: any): Promise<Deliberation> {
    return this.updateInTable('deliberations', id, data);
  }

  async delete(id: string): Promise<void> {
    return this.deleteFromTable('deliberations', id);
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
          updated_at
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

      // Map database format to API format
      return data.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description,
        notion: item.notion,
        status: item.status,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })) as Deliberation[];
    } catch (error) {
      logger.error({ error, filter }, 'Deliberation repository findAll failed');
      throw error;
    }
  }
}