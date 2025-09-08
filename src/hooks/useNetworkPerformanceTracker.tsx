// Track network performance for API calls and streaming
import { useCallback, useRef } from 'react';
import { productionLogger } from '@/utils/productionLogger';
import { networkTracker, NetworkPerformanceTracker } from '@/utils/networkTracker';

interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  startTime: number;
  endTime?: number;
  status?: number;
  size?: number;
  duration?: number;
  error?: string;
  type: 'api' | 'stream' | 'resource';
}

export const useNetworkPerformanceTracker = () => {
  const activeRequestsRef = useRef<Set<string>>(new Set());

  const startTracking = useCallback((url: string, method: string = 'GET', type: 'api' | 'stream' | 'resource' = 'api'): string => {
    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    activeRequestsRef.current.add(id);
    networkTracker.startRequest(id, url, method, type);
    return id;
  }, []);

  const endTracking = useCallback((id: string, status?: number, size?: number, error?: string): NetworkRequest | null => {
    activeRequestsRef.current.delete(id);
    return networkTracker.endRequest(id, status, size, error);
  }, []);

  const trackFetch = useCallback(async (
    url: string,
    options: RequestInit = {},
    type: 'api' | 'stream' | 'resource' = 'api'
  ): Promise<Response> => {
    const trackingId = startTracking(url, options.method || 'GET', type);
    
    try {
      const response = await fetch(url, options);
      
      // Try to get response size
      const contentLength = response.headers.get('content-length');
      const size = contentLength ? parseInt(contentLength, 10) : undefined;
      
      endTracking(trackingId, response.status, size);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      endTracking(trackingId, undefined, undefined, errorMessage);
      throw error;
    }
  }, [startTracking, endTracking]);

  const getMetrics = useCallback((id: string) => {
    return networkTracker.getRequestMetrics(id);
  }, []);

  const getAllMetrics = useCallback(() => {
    return networkTracker.getAllMetrics();
  }, []);

  const logSummary = useCallback(() => {
    networkTracker.logSummary();
  }, []);

  return {
    startTracking,
    endTracking,
    trackFetch,
    getMetrics,
    getAllMetrics,
    logSummary
  };
};