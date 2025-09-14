// Production-safe network performance tracker with graceful degradation
import { useCallback, useRef } from 'react';
import { logger } from '@/utils/logger';
import { useErrorHandler } from '@/hooks/useErrorHandler';

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

// Lightweight network tracking without external dependencies
class SimpleNetworkTracker {
  private requests = new Map<string, NetworkRequest>();
  
  startRequest(id: string, url: string, method: string, type: 'api' | 'stream' | 'resource'): void {
    this.requests.set(id, {
      id,
      url,
      method,
      type,
      startTime: Date.now()
    });
  }
  
  endRequest(id: string, status?: number, size?: number, error?: string): NetworkRequest | null {
    const request = this.requests.get(id);
    if (!request) return null;
    
    const endTime = Date.now();
    const updatedRequest = {
      ...request,
      endTime,
      duration: endTime - request.startTime,
      status,
      size,
      error
    };
    
    this.requests.set(id, updatedRequest);
    
    // Clean up old requests (keep only last 100)
    if (this.requests.size > 100) {
      const oldest = Array.from(this.requests.keys())[0];
      this.requests.delete(oldest);
    }
    
    return updatedRequest;
  }
  
  getRequestMetrics(id: string): NetworkRequest | null {
    return this.requests.get(id) || null;
  }
  
  getAllMetrics(): NetworkRequest[] {
    return Array.from(this.requests.values());
  }
  
  logSummary(): void {
    if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') {
      const requests = this.getAllMetrics();
      const avgDuration = requests.length > 0 
        ? requests.reduce((sum, r) => sum + (r.duration || 0), 0) / requests.length 
        : 0;
      logger.info('Network performance summary', {
        totalRequests: requests.length,
        averageDuration: avgDuration
      });
    }
  }
}

const simpleTracker = new SimpleNetworkTracker();

export const useNetworkPerformanceTracker = () => {
  const activeRequestsRef = useRef<Set<string>>(new Set());
  const { handleError } = useErrorHandler();

  const startTracking = useCallback((url: string, method: string = 'GET', type: 'api' | 'stream' | 'resource' = 'api'): string => {
    try {
      const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      activeRequestsRef.current.add(id);
      simpleTracker.startRequest(id, url, method, type);
      return id;
    } catch (error) {
      handleError(error, 'network tracking start');
      return 'fallback_id';
    }
  }, [handleError]);

  const endTracking = useCallback((id: string, status?: number, size?: number, error?: string): NetworkRequest | null => {
    try {
      activeRequestsRef.current.delete(id);
      return simpleTracker.endRequest(id, status, size, error);
    } catch (err) {
      handleError(err, 'network tracking end');
      return null;
    }
  }, [handleError]);

  const trackFetch = useCallback(async (
    url: string,
    options: RequestInit = {},
    type: 'api' | 'stream' | 'resource' = 'api'
  ): Promise<Response> => {
    const trackingId = startTracking(url, options.method || 'GET', type);
    
    try {
      const response = await fetch(url, options);
      
      // Safely try to get response size
      let size: number | undefined;
      try {
        const contentLength = response.headers.get('content-length');
        size = contentLength ? parseInt(contentLength, 10) : undefined;
      } catch {
        // Ignore content length parsing errors
      }
      
      endTracking(trackingId, response.status, size);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      endTracking(trackingId, undefined, undefined, errorMessage);
      throw error;
    }
  }, [startTracking, endTracking]);

  const getMetrics = useCallback((id: string) => {
    try {
      return simpleTracker.getRequestMetrics(id);
    } catch (error) {
      handleError(error, 'metrics retrieval');
      return null;
    }
  }, [handleError]);

  const getAllMetrics = useCallback(() => {
    try {
      return simpleTracker.getAllMetrics();
    } catch (error) {
      handleError(error, 'all metrics retrieval');
      return [];
    }
  }, [handleError]);

  const logSummary = useCallback(() => {
    try {
      simpleTracker.logSummary();
    } catch (error) {
      handleError(error, 'summary logging');
    }
  }, [handleError]);

  return {
    startTracking,
    endTracking,
    trackFetch,
    getMetrics,
    getAllMetrics,
    logSummary
  };
};