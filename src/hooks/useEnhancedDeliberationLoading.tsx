/**
 * Enhanced Deliberation Loading Hook with Auto-retry and Stale Connection Recovery
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { useOptimizedDeliberationService } from '@/hooks/useOptimizedDeliberationService';
import { useServices } from '@/hooks/useServices';
import { useToast } from '@/hooks/use-toast';
import { useStableRealtimeConnection } from '@/hooks/useStableRealtimeConnection';
import { logger } from '@/utils/logger';
import { supabase } from '@/integrations/supabase/client';

interface DeliberationLoadingState {
  loading: boolean;
  error: string | null;
  deliberation: any | null;
  isParticipant: boolean;
  agentConfigs: Array<{agent_type: string; name: string; description?: string;}>;
  retryCount: number;
}

interface UseEnhancedDeliberationLoadingOptions {
  maxRetries?: number;
  baseDelay?: number;
  timeout?: number;
  autoRecovery?: boolean;
}

export const useEnhancedDeliberationLoading = (
  deliberationId: string | undefined,
  options: UseEnhancedDeliberationLoadingOptions = {}
) => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    timeout = 10000,
    autoRecovery = true
  } = options;

  const { user, isAdmin } = useSupabaseAuth();
  const { toast } = useToast();
  const deliberationService = useOptimizedDeliberationService();
  const services = useServices();
  const { connectionState, forceReconnect } = useStableRealtimeConnection(deliberationId);
  
  const [state, setState] = useState<DeliberationLoadingState>({
    loading: false,
    error: null,
    deliberation: null,
    isParticipant: false,
    agentConfigs: [],
    retryCount: 0
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingRef = useRef<boolean>(false);
  
  // Stabilize service references to prevent dependency loops
  const agentServiceRef = useRef(services.agentService);
  const connectionStateRef = useRef(connectionState);
  
  useEffect(() => {
    agentServiceRef.current = services.agentService;
    connectionStateRef.current = connectionState;
  }, [services.agentService, connectionState]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const loadDeliberation = useCallback(async (retryAttempt = 0) => {
    if (!deliberationId || !user) {
      logger.warn('Missing deliberation ID or user for loading');
      return;
    }

    // Circuit breaker: prevent multiple simultaneous loads
    if (loadingRef.current && retryAttempt === 0) {
      logger.warn('Load already in progress, skipping duplicate request');
      return;
    }

    loadingRef.current = true;

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setState(prev => ({ 
      ...prev, 
      loading: true, 
      error: null, 
      retryCount: retryAttempt 
    }));

    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        timeoutRef.current = setTimeout(() => {
          reject(new Error('Request timeout'));
        }, timeout);
      });

      // Load data with timeout using stable refs
      const [deliberationData, agentsData] = await Promise.race([
        Promise.all([
          deliberationService.getDeliberation(deliberationId),
          agentServiceRef.current.getAgentsByDeliberation(deliberationId)
        ]),
        timeoutPromise
      ]) as any[];

      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Check if request was aborted
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      logger.info('Deliberation data loaded successfully:', { 
        title: deliberationData.title,
        participantCount: deliberationData.participants?.length || 0,
        userId: user.id,
        retryAttempt
      });

      // Process participants
      const participants = deliberationData.participants || [];
      const isUserParticipant = participants.some((p: any) => p.user_id === user.id);
      
      const mappedConfigs = agentsData.map(agent => ({
        agent_type: agent.agent_type,
        name: agent.name,
        description: agent.description
      }));

      setState(prev => ({
        ...prev,
        deliberation: deliberationData,
        isParticipant: isUserParticipant,
        agentConfigs: mappedConfigs,
        loading: false,
        error: null,
        retryCount: 0
      }));

      loadingRef.current = false;

    } catch (error: any) {
      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Don't handle aborted requests
      if (error.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        loadingRef.current = false;
        return;
      }

      logger.error('Load deliberation error:', { 
        error: error.message, 
        retryAttempt, 
        deliberationId,
        connectionState: connectionStateRef.current.status 
      });

      // Determine if we should retry
      const shouldRetry = retryAttempt < maxRetries && (
        error.message?.includes('timeout') ||
        error.message?.includes('network') ||
        error.message?.includes('fetch') ||
        error.message?.includes('Failed to fetch') ||
        error.code === 'PGRST301' || // PostgreSQL connection error
        !connectionStateRef.current.isConnected
      );

      if (shouldRetry) {
        const delay = baseDelay * Math.pow(2, retryAttempt);
        logger.info(`Auto-retrying deliberation load in ${delay}ms (attempt ${retryAttempt + 1}/${maxRetries})`);
        
        // Try to reconnect if connection is lost
        if (!connectionStateRef.current.isConnected) {
          logger.info('Connection lost, attempting reconnection');
          forceReconnect();
        }
        
        setTimeout(() => {
          loadDeliberation(retryAttempt + 1);
        }, delay);
        return;
      }

      // Final error state
      loadingRef.current = false;
      const errorMessage = retryAttempt >= maxRetries 
        ? "Connection appears to be stale. Please refresh the page or check your internet connection."
        : error.message || "Failed to load deliberation details";
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
        retryCount: retryAttempt
      }));

      toast({
        title: "Loading Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [
    deliberationId,
    user,
    deliberationService,
    toast,
    forceReconnect,
    maxRetries,
    baseDelay,
    timeout
  ]);

  // Enhanced manual retry function with comprehensive state reset
  const retryLoad = useCallback(() => {
    logger.info('Manual retry initiated', { 
      previousError: state.error,
      retryCount: state.retryCount,
      connectionStatus: connectionStateRef.current.status 
    });

    // Cancel any existing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Reset all loading state completely
    loadingRef.current = false;
    setState(prev => ({ 
      ...prev, 
      error: null, 
      loading: false, 
      retryCount: 0 
    }));
    
    // Force realtime connection reset regardless of current status
    logger.info('Forcing realtime connection reset for fresh start');
    forceReconnect();
    
    // Small delay to allow connection reset to take effect
    setTimeout(() => {
      loadDeliberation(0);
    }, 500);
  }, [loadDeliberation, forceReconnect, state.error, state.retryCount]);

  // Auto-recovery watchdog
  useEffect(() => {
    if (!autoRecovery || !state.loading) return;

    const watchdog = setTimeout(() => {
      if (state.loading && !state.error) {
        logger.warn('Loading watchdog triggered - attempting auto-recovery');
        
        if (navigator.onLine) {
          logger.info('Network is online, attempting fresh load');
          loadDeliberation(0);
        } else {
          setState(prev => ({
            ...prev,
            loading: false,
            error: 'No network connection detected. Please check your internet and try again.'
          }));
        }
      }
    }, 12000); // 12 second watchdog

    return () => clearTimeout(watchdog);
  }, [state.loading, state.error, loadDeliberation, autoRecovery]);

  return {
    ...state,
    loadDeliberation: () => loadDeliberation(0),
    retryLoad,
    canRetry: !state.loading && !!state.error,
    connectionStatus: connectionState.status
  };
};