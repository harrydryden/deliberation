import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import type { 
  FilterParams, 
  CreateData, 
  UpdateData, 
  GenericDbResult, 
  DatabaseError 
} from '@/types';

/**
 * Base repository class for Supabase operations
 * Provides common functionality for all repositories using Supabase auth
 */
export abstract class SupabaseBaseRepository {
  // Standardized auth helper - always use session for API calls
  protected async getCurrentSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }

  protected async getCurrentUser() {
    const session = await this.getCurrentSession();
    return session?.user || null;
  }

  protected async getCurrentUserId(): Promise<string | null> {
    const user = await this.getCurrentUser();
    return user?.id || null;
  }

  // Get access token for API calls
  protected async getAccessToken(): Promise<string | null> {
    const session = await this.getCurrentSession();
    return session?.access_token || null;
  }

  // Note: Admin status checking is handled by useSupabaseAuth hook in components
  // This repository should focus on data operations, not auth logic
  protected async isCurrentUserAdmin(): Promise<boolean> {
    // This method is deprecated - use useSupabaseAuth().isAdmin in components
    const userId = await this.getCurrentUserId();
    if (!userId) return false;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('user_role')
        .eq('id', userId)
        .eq('user_role', 'admin')
        .single();
      
      return !!data;
    } catch (error) {
      logger.error('Error checking admin status:', error as Error);
      return false;
    }
  }

  protected logError(operation: string, error: Error | DatabaseError) {
    logger.error(`Repository error in ${operation}:`, error);
  }

  protected logInfo(operation: string, data?: Record<string, unknown>) {
    logger.info(`Repository operation: ${operation}`, data);
  }

  // Protected helper methods for child repositories
  protected async findAllFromTable(tableName: string, filter?: FilterParams): Promise<unknown[]> {
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
      this.logError(`findAllFromTable in ${tableName}`, error as Error);
      throw error;
    }
  }

  protected async findByIdFromTable(tableName: string, id: string): Promise<unknown | null> {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      this.logError(`findByIdFromTable in ${tableName}`, error as Error);
      throw error;
    }
  }

  protected async createInTable(tableName: string, data: CreateData): Promise<unknown> {
    try {
      const { data: result, error } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } catch (error) {
      this.logError(`createInTable in ${tableName}`, error as Error);
      throw error;
    }
  }

  protected async updateInTable(tableName: string, id: string, data: UpdateData): Promise<unknown> {
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
      this.logError(`updateInTable in ${tableName}`, error as Error);
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
      this.logError(`deleteFromTable in ${tableName}`, error as Error);
      throw error;
    }
  }
}