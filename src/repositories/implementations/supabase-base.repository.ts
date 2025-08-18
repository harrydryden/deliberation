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

  // Protected helper methods for child repositories
  protected async findAllFromTable(tableName: string, filter?: Record<string, any>): Promise<any[]> {
    try {
      let query = supabase.from(tableName).select('*');
      
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
      if (error) throw error;
      return data || [];
    } catch (error) {
      this.logError(`findAllFromTable in ${tableName}`, error);
      throw error;
    }
  }

  protected async findByIdFromTable(tableName: string, id: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      this.logError(`findByIdFromTable in ${tableName}`, error);
      throw error;
    }
  }

  protected async createInTable(tableName: string, data: any): Promise<any> {
    try {
      const { data: result, error } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } catch (error) {
      this.logError(`createInTable in ${tableName}`, error);
      throw error;
    }
  }

  protected async updateInTable(tableName: string, id: string, data: any): Promise<any> {
    try {
      const { data: result, error } = await supabase
        .from(tableName)
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } catch (error) {
      this.logError(`updateInTable in ${tableName}`, error);
      throw error;
    }
  }

  protected async deleteFromTable(tableName: string, id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    } catch (error) {
      this.logError(`deleteFromTable in ${tableName}`, error);
      throw error;
    }
  }
}