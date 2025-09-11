import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { productionLogger } from '@/utils/productionLogger';

interface RealtimeConnectionState {
  isConnected: boolean;
  lastActivity: number;
  reconnectAttempts: number;
  connectionError: string | null;
  totalMessages: number;
  status: 'connected' | 'disconnected' | 'reconnecting' | 'error';
}

interface RealtimeConnectionHook {
  connectionState: RealtimeConnectionState;
  forceReconnect: () => void;
  getHealthStats: () => {
    isHealthy: boolean;
    lastActivityTime: string;
    reconnectAttempts: number;
    status: string;
  };
}

export const useRealtimeConnection = (deliberationId?: string): RealtimeConnectionHook => {
  const [state, setState] = useState<RealtimeConnectionState>({
    isConnected: false,
    lastActivity: Date.now(),
    reconnectAttempts: 0,
    connectionError: null,
    totalMessages: 0,
    status: 'disconnected'
  });

  const channelRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const healthCheckIntervalRef = useRef<NodeJS.Timeout>();
  const maxReconnectAttempts = 5;

  // Health check - detect stale connections
  const performHealthCheck = useCallback(() => {
    const now = Date.now();
    const timeSinceLastActivity = now - state.lastActivity;
    const staleThreshold = 300000; // 5 minutes (increased from 1 minute)

    // Only mark as error if truly disconnected AND stale
    if (timeSinceLastActivity > staleThreshold && !state.isConnected) {
      productionLogger.warn('Real-time connection appears stale and disconnected', {
        timeSinceLastActivity,
        deliberationId
      });
      
      setState(prev => ({
        ...prev,
        status: 'error',
        connectionError: 'Connection stale and disconnected'
      }));
    }
  }, [state.lastActivity, state.isConnected, deliberationId]);

  // Connect with exponential backoff
  const connect = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setState(prev => ({ ...prev, status: 'reconnecting' }));

    try {
      const channel = supabase
        .channel(`realtime-${deliberationId || 'global'}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: deliberationId ? `deliberation_id=eq.${deliberationId}` : undefined,
          },
          (payload) => {
            productionLogger.info('Real-time message received', {
              messageId: payload.new.id,
              deliberationId: payload.new.deliberation_id
            });

            setState(prev => ({
              ...prev,
              isConnected: true,
              lastActivity: Date.now(),
              reconnectAttempts: 0,
              connectionError: null,
              totalMessages: prev.totalMessages + 1,
              status: 'connected'
            }));
          }
        )
        .on('system', {}, (payload) => {
          productionLogger.debug('Real-time system event', payload);
          
          if (payload.event === 'system') {
            setState(prev => ({
              ...prev,
              lastActivity: Date.now()
            }));
          }
        })
        .subscribe((status) => {
          productionLogger.info('Real-time subscription status', { status, deliberationId });
          
          if (status === 'SUBSCRIBED') {
            setState(prev => ({
              ...prev,
              isConnected: true,
              status: 'connected',
              reconnectAttempts: 0,
              connectionError: null,
              lastActivity: Date.now() // Update activity on successful subscription
            }));
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setState(prev => ({
              ...prev,
              isConnected: false,
              status: 'error',
              connectionError: `Subscription ${status.toLowerCase()}`
            }));
            
            // Retry with exponential backoff
            scheduleReconnect();
          }
        });

      channelRef.current = channel;
    } catch (error) {
      productionLogger.error('Real-time connection failed', error);
      setState(prev => ({
        ...prev,
        isConnected: false,
        status: 'error',
        connectionError: error instanceof Error ? error.message : 'Connection failed'
      }));
      scheduleReconnect();
    }
  }, [deliberationId]);

  // Schedule reconnect with exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (state.reconnectAttempts >= maxReconnectAttempts) {
      productionLogger.error('Max reconnection attempts reached', { deliberationId });
      setState(prev => ({
        ...prev,
        status: 'error',
        connectionError: 'Max reconnection attempts reached'
      }));
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000);
    
    productionLogger.info('Scheduling real-time reconnect', { 
      delay, 
      attempt: state.reconnectAttempts + 1,
      deliberationId 
    });

    setState(prev => ({
      ...prev,
      reconnectAttempts: prev.reconnectAttempts + 1
    }));

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [state.reconnectAttempts, connect, deliberationId]);

  // Force reconnection
  const forceReconnect = useCallback(() => {
    productionLogger.info('Force reconnecting real-time', { deliberationId });
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    setState(prev => ({
      ...prev,
      reconnectAttempts: 0,
      connectionError: null
    }));

    connect();
  }, [connect, deliberationId]);

  // Get health statistics
  const getHealthStats = useCallback(() => {
    const timeSinceLastActivity = Date.now() - state.lastActivity;
    return {
      isHealthy: state.isConnected && timeSinceLastActivity < 60000,
      lastActivityTime: new Date(state.lastActivity).toLocaleTimeString(),
      reconnectAttempts: state.reconnectAttempts,
      status: state.status
    };
  }, [state]);

  // Initialize connection
  useEffect(() => {
    if (deliberationId) {
      connect();
    }

    // Start health check interval
    healthCheckIntervalRef.current = setInterval(performHealthCheck, 30000); // Check every 30s

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
    };
  }, [deliberationId, connect, performHealthCheck]);

  return {
    connectionState: state,
    forceReconnect,
    getHealthStats
  };
};