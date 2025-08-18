import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

/**
 * Base repository class for Supabase operations
 * Provides common functionality for all repositories using Supabase auth
 */
export abstract class SupabaseBaseRepository {
  protected async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }

  protected async getCurrentUserId(): Promise<string | null> {
    const user = await this.getCurrentUser();
    return user?.id || null;
  }

  protected async isCurrentUserAdmin(): Promise<boolean> {
    const userId = await this.getCurrentUserId();
    if (!userId) return false;

    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .single();
      
      return !!data;
    } catch (error) {
      logger.error('Error checking admin status:', error);
      return false;
    }
  }

  protected logError(operation: string, error: any) {
    logger.error(`Repository error in ${operation}:`, error);
  }

  protected logInfo(operation: string, data?: any) {
    logger.info(`Repository operation: ${operation}`, data);
  }
}