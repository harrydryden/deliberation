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

  // Common CRUD operations
  async findAll(tableName: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      this.logError(`findAll in ${tableName}`, error);
      throw error;
    }
  }

  async findById(tableName: string, id: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      this.logError(`findById in ${tableName}`, error);
      throw error;
    }
  }

  async create(tableName: string, data: any): Promise<any> {
    try {
      const { data: result, error } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } catch (error) {
      this.logError(`create in ${tableName}`, error);
      throw error;
    }
  }

  async update(tableName: string, id: string, data: any): Promise<any> {
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
      this.logError(`update in ${tableName}`, error);
      throw error;
    }
  }

  async delete(tableName: string, id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    } catch (error) {
      this.logError(`delete in ${tableName}`, error);
      throw error;
    }
  }
}