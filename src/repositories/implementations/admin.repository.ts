import { supabase } from '@/integrations/supabase/client';
import { IAdminRepository } from '../interfaces';
import { logger } from '@/utils/logger';

export class AdminRepository implements IAdminRepository {
  async getSystemStats(): Promise<{
    totalUsers: number;
    totalDeliberations: number;
    totalMessages: number;
    activeDeliberations: number;
    totalAccessCodes: number;
    usedAccessCodes: number;
  }> {
    try {
      // Context is now set automatically via headers

      // Execute multiple queries in parallel for better performance
      console.log('Starting admin stats queries...');
      
      const [
        usersResult,
        deliberationsResult,
        messagesResult,
        activeDeliberationsResult,
        accessCodesResult,
        usedAccessCodesResult
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('deliberations').select('id', { count: 'exact', head: true }),
        supabase.from('messages').select('id', { count: 'exact', head: true }),
        supabase.from('deliberations').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('access_codes').select('id', { count: 'exact', head: true }),
        supabase.from('access_codes').select('id', { count: 'exact', head: true }).eq('is_used', true)
      ]);

      console.log('Admin stats query results:', {
        users: { count: usersResult.count, error: usersResult.error },
        deliberations: { count: deliberationsResult.count, error: deliberationsResult.error },
        messages: { count: messagesResult.count, error: messagesResult.error },
        activeDeliberations: { count: activeDeliberationsResult.count, error: activeDeliberationsResult.error },
        accessCodes: { count: accessCodesResult.count, error: accessCodesResult.error },
        usedAccessCodes: { count: usedAccessCodesResult.count, error: usedAccessCodesResult.error }
      });

      // Check for errors
      const errors = [
        usersResult.error,
        deliberationsResult.error,
        messagesResult.error,
        activeDeliberationsResult.error,
        accessCodesResult.error,
        usedAccessCodesResult.error
      ].filter(Boolean);

      if (errors.length > 0) {
        logger.error({ errors }, 'Admin repository getSystemStats error');
        throw new Error('Failed to fetch system statistics');
      }

      const stats = {
        totalUsers: usersResult.count || 0,
        totalDeliberations: deliberationsResult.count || 0,
        totalMessages: messagesResult.count || 0,
        activeDeliberations: activeDeliberationsResult.count || 0,
        totalAccessCodes: accessCodesResult.count || 0,
        usedAccessCodes: usedAccessCodesResult.count || 0,
      };

      logger.info({ stats }, 'System stats retrieved successfully');
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

      logger.info({ deliberationId }, 'Deliberation messages cleared successfully');
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

      logger.info({ deliberationId }, 'Deliberation IBIS data cleared successfully');
    } catch (error) {
      logger.error({ error, deliberationId }, 'Admin repository clearDeliberationIbis failed');
      throw error;
    }
  }
}