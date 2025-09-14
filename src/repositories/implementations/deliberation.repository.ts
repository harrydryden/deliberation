import { supabase } from '@/integrations/supabase/client';
import { SupabaseBaseRepository } from './supabase-base.repository';
import { IDeliberationRepository } from '../interfaces';
import { Deliberation } from '@/types/index';
import { logger } from '@/utils/logger';

export class DeliberationRepository extends SupabaseBaseRepository implements IDeliberationRepository {
  
  async findById(id: string): Promise<Deliberation | null> {
    try {
      const { data, error } = await supabase
        .from('deliberations')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return this.mapToDeliberation(data);
    } catch (error) {
      logger.error('Deliberation repository findById failed', error as Error, { id });
      throw error;
    }
  }

  async create(data: any): Promise<Deliberation> {
    try {
      const { data: result, error } = await supabase
        .from('deliberations')
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return this.mapToDeliberation(result);
    } catch (error) {
      logger.error('Deliberation repository create failed', error as Error, { data });
      throw error;
    }
  }

  async update(id: string, data: any): Promise<Deliberation> {
    try {
      const { data: result, error } = await supabase
        .from('deliberations')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return this.mapToDeliberation(result);
    } catch (error) {
      logger.error('Deliberation repository update failed', error as Error, { id, data });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    return this.deleteFromTable('deliberations', id);
  }

  private mapToDeliberation(data: any): Deliberation {
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      notion: data.notion,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async findByStatus(status: string): Promise<Deliberation[]> {
    try {
      const { data, error } = await supabase
        .from('deliberations')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Deliberation repository findByStatus error', error as Error, { status });
        throw error;
      }

      return data.map(item => this.mapToDeliberation(item));
    } catch (error) {
      logger.error('Deliberation repository findByStatus failed', error as Error, { status });
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
        logger.error('Deliberation repository findByFacilitator error', error as Error, { facilitatorId });
        throw error;
      }

      return data.map(item => this.mapToDeliberation(item));
    } catch (error) {
      logger.error('Deliberation repository findByFacilitator failed', error as Error, { facilitatorId });
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
        logger.error('Deliberation repository findPublic error', error as Error);
        throw error;
      }

      return data.map(item => this.mapToDeliberation(item));
    } catch (error) {
      logger.error('Deliberation repository findPublic failed', error as Error);
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
        logger.error('Deliberation repository findAll error', error as Error, { filter });
        throw error;
      }

      // Map database format to API format
      return data.map(item => this.mapToDeliberation(item));
    } catch (error) {
      logger.error('Deliberation repository findAll failed', error as Error, { filter });
      throw error;
    }
  }
}