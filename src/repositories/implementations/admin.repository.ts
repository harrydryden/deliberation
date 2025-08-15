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
      // Execute multiple queries in parallel for better performance
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
}