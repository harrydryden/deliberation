import { useCallback, useState, useRef, useEffect } from 'react';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { ErrorRecoveryService } from '@/services/error-recovery.service';
import { logger } from '@/utils/logger';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

interface AsyncOperationConfig {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  context?: string;
  fallbackValue?: any;
  useCircuitBreaker?: boolean;
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Unified async operations hook - combines useOptimizedAI and useOptimizedApiCalls
 */
export const useOptimizedAsync = <T = any, Args extends any[] = any[]>(
  asyncFunction: (...args: Args) => Promise<T>,
  config: AsyncOperationConfig = {}
) => {
  const { 
    maxRetries = 2,
    retryDelay = 1000,
    timeout = 30000,
    context = 'async_operation',
    fallbackValue = null,
    useCircuitBreaker = false
  } = config;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const { handleError } = useErrorHandler();
  const abortControllerRef = useRef<AbortController | null>(null);

  const executeWithRetries = useCallback(async (...args: Args): Promise<T> => {
    const operation = () => asyncFunction(...args);

    if (useCircuitBreaker) {
      return await ErrorRecoveryService.withCircuitBreaker(operation, context);
    }

    if (fallbackValue !== null) {
      return await ErrorRecoveryService.withOpenAIFallback(operation, fallbackValue, context);
    }

    return await ErrorRecoveryService.withRetry(operation, { maxRetries }, context);
  }, [asyncFunction, maxRetries, context, fallbackValue, useCircuitBreaker]);

  const execute = useCallback(async (...args: Args) => {
    // Cancel any ongoing operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const timeoutId = timeout > 0 ? setTimeout(() => {
      abortControllerRef.current?.abort();
    }, timeout) : null;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await executeWithRetries(...args);
      
      if (!abortControllerRef.current?.signal.aborted) {
        setState({ data: result, loading: false, error: null });
      }
      return result;
    } catch (error) {
      if (!abortControllerRef.current?.signal.aborted) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        setState({ data: null, loading: false, error: errorObj });
        logger.error(`${context} failed`, { error: errorObj });
        handleError(errorObj, context);
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, [executeWithRetries, timeout, context, handleError]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState({ data: null, loading: false, error: null });
  }, [cancel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    execute,
    cancel,
    reset,
  };
};

/**
 * Specialized hook for Supabase function calls
 */
export const useSupabaseFunction = (functionName: string, config: AsyncOperationConfig = {}) => {
  const { toast } = useToast();
  
  const functionCall = useCallback(async (body?: any) => {
    try {
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
  }, [functionName]);

  return useOptimizedAsync(functionCall, { ...config, context: `supabase_function_${functionName}` });
};

/**
 * Specialized hook for database operations
 */
export const useSupabaseQuery = (
  table: string,
  query: {
    select?: string;
    filters?: Record<string, any>;
    orderBy?: { column: string; ascending?: boolean };
    limit?: number;
  } = {},
  config: AsyncOperationConfig = {}
) => {
  const queryOperation = useCallback(async () => {
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
  }, [table, query]);

  return useOptimizedAsync(queryOperation, { ...config, context: `supabase_query_${table}` });
};

/**
 * Legacy compatibility exports
 */
export const useOptimizedAI = () => {
  const { handleError } = useErrorHandler();

  const callAIService = useCallback(async (
    serviceCall: () => Promise<any>,
    options: { context?: string; fallbackValue?: any; useCircuitBreaker?: boolean; maxRetries?: number } = {}
  ): Promise<any> => {
    const asyncHook = useOptimizedAsync(serviceCall, options);
    return asyncHook.execute();
  }, [handleError]);

  const callNetworkService = useCallback(async (
    serviceCall: () => Promise<any>,
    context: string = 'network_service'
  ): Promise<any> => {
    const asyncHook = useOptimizedAsync(serviceCall, { context });
    return asyncHook.execute();
  }, [handleError]);

  return { callAIService, callNetworkService };
};

export const useOptimizedApiCalls = () => {
  const { toast } = useToast();

  const invokeFunction = useCallback((
    functionName: string, 
    body?: any
  ) => {
    return {
      execute: async () => {
        const hook = useSupabaseFunction(functionName);
        return hook.execute(body);
      }
    };
  }, []);

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
        const hook = useSupabaseQuery(table, query);
        return hook.execute();
      }
    };
  }, []);

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