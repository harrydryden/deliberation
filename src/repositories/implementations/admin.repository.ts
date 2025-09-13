import { supabase } from '@/integrations/supabase/client';
import { IAdminRepository } from '../interfaces';
import { SupabaseBaseRepository } from './supabase-base.repository';
import { logger } from '@/utils/logger';

export class AdminRepository extends SupabaseBaseRepository implements IAdminRepository {
  async getSystemStats(): Promise<{
    totalUsers: number;
    totalDeliberations: number;
    totalMessages: number;
    activeDeliberations: number;
  }> {
    try {
      const { data, error } = await supabase.rpc('admin_get_system_stats');
      
      if (error) {
        logger.error({ error }, 'Admin repository getSystemStats RPC error');
        throw error;
      }

      if (data?.error) {
        logger.error({ error: data.error }, 'Admin repository getSystemStats function error');
        throw new Error(data.error);
      }

      const stats = {
        totalUsers: data.totalUsers || 0,
        totalDeliberations: data.totalDeliberations || 0,
        totalMessages: data.totalMessages || 0,
        activeDeliberations: data.activeDeliberations || 0,
      };

      logger.info('Admin stats retrieved successfully');
      return stats;
    } catch (error) {
      logger.error({ error }, 'Admin repository getSystemStats failed');
      throw error;
    }
  }

  async clearDeliberationMessages(deliberationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('deliberation_id', deliberationId);

      if (error) {
        logger.error({ error, deliberationId }, 'Admin repository clearDeliberationMessages error');
        throw error;
      }

      logger.info('Deliberation messages cleared successfully');
    } catch (error) {
      logger.error({ error, deliberationId }, 'Admin repository clearDeliberationMessages failed');
      throw error;
    }
  }

  async clearDeliberationIbis(deliberationId: string): Promise<void> {
    try {
      // Delete in the correct order to handle foreign key constraints
      // 1. Delete IBIS node ratings first
      const { error: ratingsError } = await supabase
        .from('ibis_node_ratings')
        .delete()
        .eq('deliberation_id', deliberationId);

      if (ratingsError) {
        logger.error({ error: ratingsError, deliberationId }, 'Error deleting IBIS node ratings');
        throw ratingsError;
      }

      // 2. Delete IBIS relationships
      const { error: relationshipsError } = await supabase
        .from('ibis_relationships')
        .delete()
        .eq('deliberation_id', deliberationId);

      if (relationshipsError) {
        logger.error({ error: relationshipsError, deliberationId }, 'Error deleting IBIS relationships');
        throw relationshipsError;
      }

      // 3. Delete IBIS nodes last
      const { error: nodesError } = await supabase
        .from('ibis_nodes')
        .delete()
        .eq('deliberation_id', deliberationId);

      if (nodesError) {
        logger.error({ error: nodesError, deliberationId }, 'Error deleting IBIS nodes');
        throw nodesError;
      }

      logger.info('Deliberation IBIS data cleared successfully');
    } catch (error) {
      logger.error({ error, deliberationId }, 'Admin repository clearDeliberationIbis failed');
      throw error;
    }
  }
}