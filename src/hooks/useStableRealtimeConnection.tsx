import { useState, useEffect, useCallback, useRef } from 'react';
import { optimizedRealtimeService } from '@/services/optimized-realtime.service';
import { logger } from '@/utils/logger';

interface RealtimeConnectionState {
  isConnected: boolean;
  status: 'connected' | 'disconnected' | 'reconnecting' | 'error';
  connectionError: string | null;
  lastActivity: number;
}

interface RealtimeConnectionHook {
  connectionState: RealtimeConnectionState;
  forceReconnect: () => void;
  getHealthStats: () => {
    isHealthy: boolean;
    status: string;
    lastActivityTime: string;
  };
}

export const useStableRealtimeConnection = (deliberationId?: string): RealtimeConnectionHook => {
  const [state, setState] = useState<RealtimeConnectionState>({
    isConnected: false,
    status: 'disconnected',
    connectionError: null,
    lastActivity: Date.now()
  });

  const healthCheckRef = useRef<NodeJS.Timeout>();

  // Health check with circuit breaker logic
  const performHealthCheck = useCallback(() => {
    const channelStatus = optimizedRealtimeService.getChannelStatus();
    const channelKey = deliberationId ? `messages-${deliberationId}` : 'messages-global';
    const channel = channelStatus[channelKey];
    
    // Also check for shared channel as fallback
    const sharedChannel = channelStatus['messages-shared'];

    if (channel && channel.isConnected) {
      setState(prev => ({
        ...prev,
        isConnected: true,
        status: 'connected',
        lastActivity: Date.now()
      }));
    } else if (sharedChannel && sharedChannel.isConnected) {
      setState(prev => ({
        ...prev,
        isConnected: true,
        status: 'connected',
        lastActivity: Date.now()
      }));
    } else {
      setState(prev => ({
        ...prev,
        isConnected: false,
        status: 'disconnected'
      }));
    }
  }, [deliberationId]);

  // Enhanced force reconnection with complete state reset
  const forceReconnect = useCallback(() => {
    logger.info('Force reconnecting with complete reset via optimized service');
    
    // Clear any existing health checks
    if (healthCheckRef.current) {
      clearInterval(healthCheckRef.current);
    }
    
    // Reset connection state immediately
    setState(prev => ({
      ...prev,
      isConnected: false,
      status: 'reconnecting',
      connectionError: null,
      lastActivity: Date.now()
    }));
    
    // Force complete reconnection of all channels
    optimizedRealtimeService.forceReconnectAll();
    
    // Restart health monitoring with fresh checks
    setTimeout(() => {
      performHealthCheck();
      
      // Resume regular health checks
      if (deliberationId) {
        healthCheckRef.current = setInterval(performHealthCheck, 30000);
      }
    }, 2000);
  }, [performHealthCheck, deliberationId]);

  // Get health statistics
  const getHealthStats = useCallback(() => ({
    isHealthy: state.isConnected && state.status === 'connected',
    status: state.status,
    lastActivityTime: new Date(state.lastActivity).toLocaleTimeString()
  }), [state]);

  // Initialize health monitoring
  useEffect(() => {
    if (deliberationId) {
      // Initial health check
      performHealthCheck();
      
      // Set up periodic health checks
      healthCheckRef.current = setInterval(performHealthCheck, 30000); // Every 30 seconds
      
      return () => {
        if (healthCheckRef.current) {
          clearInterval(healthCheckRef.current);
        }
      };
    }
  }, [deliberationId, performHealthCheck]);

  return {
    connectionState: state,
    forceReconnect,
    getHealthStats
  };
};