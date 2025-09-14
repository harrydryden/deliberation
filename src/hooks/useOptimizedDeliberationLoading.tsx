/**
 * Optimized Deliberation Loading with Cancellation and Error Recovery
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { logger } from '@/utils/logger';
import { LRUCache } from '@/utils/lruCache';

interface DeliberationLoadingState {
  loading: boolean;
  error: string | null;
  data: any | null;
  cancelled: boolean;
}

interface LoadingOperation {
  id: string;
  abortController: AbortController;
  promise: Promise<any>;
  timestamp: number;
}

// Cache for deliberation data
const deliberationCache = new LRUCache<string, any>(50);

export const useOptimizedDeliberationLoading = () => {
  const { session } = useSupabaseAuth();
  const [state, setState] = useState<DeliberationLoadingState>({
    loading: false,
    error: null,
    data: null,
    cancelled: false,
  });

  const activeOperations = useRef<Map<string, LoadingOperation>>(new Map());
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      // Cancel all active operations
      activeOperations.current.forEach(op => {
        op.abortController.abort();
      });
      activeOperations.current.clear();
    };
  }, []);

  const loadDeliberation = useCallback(async (deliberationId: string, forceRefresh = false) => {
    // Check cache first unless force refresh
    if (!forceRefresh) {
      const cached = deliberationCache.get(deliberationId);
      if (cached) {
        logger.info('Using cached deliberation data', { deliberationId });
        setState(prev => ({ ...prev, data: cached, loading: false, error: null }));
        return cached;
      }
    }

    // Cancel any existing operation for this deliberation
    const existingOp = activeOperations.current.get(deliberationId);
    if (existingOp) {
      existingOp.abortController.abort();
      activeOperations.current.delete(deliberationId);
    }

    // Create new operation
    const abortController = new AbortController();
    const operationId = crypto.randomUUID();
    
    if (!mountedRef.current) return null;

    setState(prev => ({ ...prev, loading: true, error: null, cancelled: false }));

    try {
      // Break down loading into smaller, cancellable operations
      const operations = [
        () => loadDeliberationBasicData(deliberationId, abortController.signal),
        () => loadDeliberationParticipants(deliberationId, abortController.signal),
        () => loadDeliberationStats(deliberationId, abortController.signal),
      ];

      const results = [];
      for (const operation of operations) {
        if (abortController.signal.aborted || !mountedRef.current) {
          throw new Error('Operation cancelled');
        }
        results.push(await operation());
      }

      const [basicData, participants, stats] = results;
      const fullData = { ...basicData, participants, stats };

      // Cache the result
      deliberationCache.set(deliberationId, fullData);

      if (mountedRef.current && !abortController.signal.aborted) {
        setState(prev => ({ 
          ...prev, 
          data: fullData, 
          loading: false, 
          error: null,
          cancelled: false 
        }));
      }

      activeOperations.current.delete(deliberationId);
      return fullData;

    } catch (error: any) {
      activeOperations.current.delete(deliberationId);
      
      if (error.name === 'AbortError' || error.message === 'Operation cancelled') {
        if (mountedRef.current) {
          setState(prev => ({ ...prev, loading: false, cancelled: true }));
        }
        return null;
      }

      logger.error('Failed to load deliberation', { deliberationId, error });
      
      if (mountedRef.current) {
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: error.message || 'Failed to load deliberation',
          cancelled: false 
        }));
      }
      
      throw error;
    }
  }, [session]);

  const cancelLoading = useCallback((deliberationId?: string) => {
    if (deliberationId) {
      const operation = activeOperations.current.get(deliberationId);
      if (operation) {
        operation.abortController.abort();
        activeOperations.current.delete(deliberationId);
      }
    } else {
      // Cancel all operations
      activeOperations.current.forEach(op => {
        op.abortController.abort();
      });
      activeOperations.current.clear();
    }
    
    setState(prev => ({ ...prev, loading: false, cancelled: true }));
  }, []);

  const clearCache = useCallback((deliberationId?: string) => {
    if (deliberationId) {
      deliberationCache.delete(deliberationId);
    } else {
      deliberationCache.clear();
    }
  }, []);

  return {
    ...state,
    loadDeliberation,
    cancelLoading,
    clearCache,
    cacheStats: deliberationCache.getStats(),
  };
};

async function loadDeliberationBasicData(deliberationId: string, signal: AbortSignal) {
  const { supabase } = await import('@/integrations/supabase/client');
  
  const { data, error } = await supabase
    .from('deliberations')
    .select('*')
    .eq('id', deliberationId)
    .single();

  if (signal.aborted) throw new Error('Operation cancelled');
  if (error) throw error;
  return data;
}

async function loadDeliberationParticipants(deliberationId: string, signal: AbortSignal) {
  const { supabase } = await import('@/integrations/supabase/client');
  
  const { data, error } = await supabase
    .from('deliberation_participants')
    .select(`
      user_id,
      joined_at,
      profiles:user_id (
        display_name,
        avatar_url
      )
    `)
    .eq('deliberation_id', deliberationId);

  if (signal.aborted) throw new Error('Operation cancelled');
  if (error) throw error;
  return data || [];
}

async function loadDeliberationStats(deliberationId: string, signal: AbortSignal) {
  const { supabase } = await import('@/integrations/supabase/client');
  
  const { data, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact' })
    .eq('deliberation_id', deliberationId);

  if (signal.aborted) throw new Error('Operation cancelled');
  if (error) throw error;
  return { messageCount: data?.length || 0 };
}