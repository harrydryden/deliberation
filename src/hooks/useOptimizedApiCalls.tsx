import { useCallback } from 'react';
import { useOptimizedAsync } from './useOptimizedAsync';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';
import { logger } from '@/utils/logger';

/**
 * Optimized hook to replace direct API calls throughout the app
 * Provides caching, error handling, and performance optimization
 */
export const useOptimizedApiCalls = () => {
  const { toast } = useToast();

  // Optimized Supabase function invocation with retry and caching
  const invokeFunction = useCallback((
    functionName: string, 
    body?: any, 
    options: {
      cacheKey?: string;
      cacheTTL?: number;
      retries?: number;
    } = {}
  ) => {
    const {
      cacheKey,
      cacheTTL = 30000,
      retries = 2
    } = options;

    return useOptimizedAsync(
      async () => {
        logger.info(`Invoking function: ${functionName}`, { body });
        
        // Consistent session-based auth for API calls
        const session = await supabase.auth.getSession();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        
        if (session.data.session?.access_token) {
          headers['Authorization'] = `Bearer ${session.data.session.access_token}`;
        }

        const response = await supabase.functions.invoke(functionName, {
          headers,
          body: body || {}
        });
        
        if (response.error) {
          throw new Error(response.error.message || 'Function call failed');
        }
        
        return response.data;
      },
      {
        retries,
        cacheKey,
        cacheTTL,
        enableCaching: !!cacheKey
      }
    );
  }, []);

  // Optimized database query with caching
  const queryTable = useCallback((
    table: string,
    query: {
      select?: string;
      filters?: Record<string, any>;
      orderBy?: { column: string; ascending?: boolean };
      limit?: number;
    } = {},
    options: {
      cacheKey?: string;
      cacheTTL?: number;
    } = {}
  ) => {
    const { cacheKey, cacheTTL = 45000 } = options;

    return useOptimizedAsync(
      async () => {
        logger.info(`Querying table: ${table}`, query);
        
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
      },
      {
        cacheKey: cacheKey || `${table}_${JSON.stringify(query)}`,
        cacheTTL,
        enableCaching: true
      }
    );
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