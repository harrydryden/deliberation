import { supabase } from '@/integrations/supabase/client';
import { IRepository } from '../interfaces';
import { DatabaseTables } from '@/config/supabase';
import { logger } from '@/utils/logger';

export abstract class BaseRepository<T extends { id: string }> implements IRepository<T> {
  constructor(protected tableName: DatabaseTables) {}

  async findAll(filter?: Record<string, any>): Promise<T[]> {
    try {
      let query = supabase.from(this.tableName).select('*');
      
      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }
      
      const { data, error } = await query;
      
      if (error) {
        logger.error('Repository findAll error', { error, tableName: this.tableName });
        throw error;
      }
      
      return data as T[];
    } catch (error) {
      logger.error('Repository findAll failed', { error, tableName: this.tableName });
      throw error;
    }
  }

  async findById(id: string): Promise<T | null> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        logger.error('Repository findById error', { error, tableName: this.tableName, id });
        throw error;
      }
      
      return data as T | null;
    } catch (error) {
      logger.error('Repository findById failed', { error, tableName: this.tableName, id });
      throw error;
    }
  }

  async create(data: Omit<T, 'id' | 'created_at' | 'updated_at'>): Promise<T> {
    try {
      const { data: result, error } = await supabase
        .from(this.tableName)
        .insert(data)
        .select()
        .single();
      
      if (error) {
        logger.error('Repository create error', { error, tableName: this.tableName, data });
        throw error;
      }
      
      logger.info('Repository create success', { tableName: this.tableName, id: result.id });
      return result as T;
    } catch (error) {
      logger.error('Repository create failed', { error, tableName: this.tableName });
      throw error;
    }
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    try {
      const { data: result, error } = await supabase
        .from(this.tableName)
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .maybeSingle();
      
      if (error) {
        logger.error('Repository update error', { error, tableName: this.tableName, id, data });
        throw error;
      }
      
      if (!result) {
        logger.error('Repository update failed: No matching record found', { tableName: this.tableName, id });
        throw new Error(`No ${this.tableName} record found with id: ${id}`);
      }
      
      logger.info('Repository update success', { tableName: this.tableName, id });
      return result as T;
    } catch (error) {
      logger.error('Repository update failed', { error, tableName: this.tableName, id });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('id', id);
      
      if (error) {
        logger.error('Repository delete error', { error, tableName: this.tableName, id });
        throw error;
      }
      
      logger.info('Repository delete success', { tableName: this.tableName, id });
    } catch (error) {
      logger.error('Repository delete failed', { error, tableName: this.tableName, id });
      throw error;
    }
  }
}