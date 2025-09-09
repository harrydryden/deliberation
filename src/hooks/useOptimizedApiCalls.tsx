import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';
import { logger } from '@/utils/logger';

/**
 * Simplified API calls hook without hooks violations
 */
export const useOptimizedApiCalls = () => {
  const { toast } = useToast();

  // Simplified Supabase function invocation without nested hooks
  const invokeFunction = useCallback((
    functionName: string, 
    body?: any
  ) => {
    return {
      execute: async () => {
        try {
          // Let Supabase handle authentication automatically
          const response = await supabase.functions.invoke(functionName, {
            body: body || {}
          });
          
          if (response.error) {
            throw new Error(response.error.message || 'Function call failed');
          }
          
          return response.data;
        } catch (error) {
          logger.error(`Function invocation error for ${functionName}:`, error);
          throw error;
        }
      }
    };
  }, []);

  // Simplified database query without nested hooks
  const queryTable = useCallback((
    table: string,
    query: {
      select?: string;
      filters?: Record<string, any>;
      orderBy?: { column: string; ascending?: boolean };
      limit?: number;
    } = {}
  ) => {
    return {
      execute: async () => {
        try {
          let queryBuilder = supabase.from(table).select(query.select || '*');
          
          if (query.filters) {
            Object.entries(query.filters).forEach(([key, value]) => {
              queryBuilder = queryBuilder.eq(key, value);
            });
          }
          
          if (query.orderBy) {
            queryBuilder = queryBuilder.order(query.orderBy.column, { 
              ascending: query.orderBy.ascending ?? true 
            });
          }
          
          if (query.limit) {
            queryBuilder = queryBuilder.limit(query.limit);
          }
          
          const { data, error } = await queryBuilder;
          
          if (error) {
            throw error;
          }
          
          return data;
        } catch (error) {
          logger.error(`Query error for table ${table}:`, error);
          throw error;
        }
      }
    };
  }, []);

  // Optimized mutation operations
  const mutateTable = useCallback(async (
    table: string,
    operation: 'insert' | 'update' | 'delete',
    data?: any,
    filters?: Record<string, any>
  ) => {
    try {
      logger.info(`Mutating table: ${table}`, { operation, data, filters });
      
      let queryBuilder = supabase.from(table);
      
      switch (operation) {
        case 'insert':
          const { data: insertData, error: insertError } = await queryBuilder.insert(data);
          if (insertError) throw insertError;
          return insertData;
          
        case 'update':
          if (!filters) throw new Error('Filters required for update operation');
          let updateBuilder = queryBuilder.update(data);
          Object.entries(filters).forEach(([key, value]) => {
            updateBuilder = updateBuilder.eq(key, value);
          });
          const { data: updateData, error: updateError } = await updateBuilder;
          if (updateError) throw updateError;
          return updateData;
          
        case 'delete':
          if (!filters) throw new Error('Filters required for delete operation');
          let deleteBuilder = queryBuilder.delete();
          Object.entries(filters).forEach(([key, value]) => {
            deleteBuilder = deleteBuilder.eq(key, value);
          });
          const { data: deleteData, error: deleteError } = await deleteBuilder;
          if (deleteError) throw deleteError;
          return deleteData;
          
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
    } catch (error) {
      logger.error(`Table mutation error for ${table}:`, error);
      toast({
        title: "Operation Failed",
        description: `Failed to ${operation} data in ${table}`,
        variant: "destructive"
      });
      throw error;
    }
  }, [toast]);

  return {
    invokeFunction,
    queryTable,
    mutateTable
  };
};