// Track network performance for API calls and streaming
import { useCallback, useRef } from 'react';
import { productionLogger } from '@/utils/productionLogger';

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

class NetworkPerformanceTracker {
  private requests = new Map<string, NetworkRequest>();
  private readonly maxRequests = 100;

  startRequest(id: string, url: string, method: string = 'GET', type: 'api' | 'stream' | 'resource' = 'api'): void {
    const request: NetworkRequest = {
      id,
      url,
      method,
      startTime: performance.now(),
      type
    };
    
    this.requests.set(id, request);
    
    // Clean up old requests if we have too many
    if (this.requests.size > this.maxRequests) {
      const oldestKey = Array.from(this.requests.keys())[0];
      this.requests.delete(oldestKey);
    }

    productionLogger.info(`Starting ${type} request: ${method} ${url}`, {
      id,
      timestamp: new Date().toISOString().slice(11, 23)
    });
  }

  endRequest(id: string, status?: number, size?: number, error?: string): NetworkRequest | null {
    const request = this.requests.get(id);
    if (!request) {
      productionLogger.warn(`No request found for ID: ${id}`);
      return null;
    }

    const endTime = performance.now();
    request.endTime = endTime;
    request.status = status;
    request.size = size;
    request.error = error;
    request.duration = endTime - request.startTime;

    const performanceGrade = this.getPerformanceGrade(request.duration, request.type);
    const sizeInfo = size ? `${(size / 1024).toFixed(2)}KB` : 'unknown';

    productionLogger.info(`Completed ${request.type} request: ${request.method} ${request.url}`, {
      id,
      duration: `${request.duration.toFixed(2)}ms`,
      status: status || 'unknown',
      size: sizeInfo,
      performance: performanceGrade,
      error: error || 'none'
    });

    // Log slow requests
    if (request.duration > this.getSlowThreshold(request.type)) {
      productionLogger.warn(`Slow ${request.type} request detected`, {
        url: request.url,
        duration: request.duration,
        method: request.method,
        status,
        size
      });
    }

    return request;
  }

  getRequestMetrics(id: string): NetworkRequest | null {
    return this.requests.get(id) || null;
  }

  getAllMetrics(): NetworkRequest[] {
    return Array.from(this.requests.values());
  }

  getMetricsByType(type: 'api' | 'stream' | 'resource'): NetworkRequest[] {
    return Array.from(this.requests.values()).filter(req => req.type === type);
  }

  private getPerformanceGrade(duration: number, type: string): string {
    const thresholds = {
      api: { fast: 500, slow: 2000 },
      stream: { fast: 1000, slow: 5000 },
      resource: { fast: 200, slow: 1000 }
    };

    const threshold = thresholds[type as keyof typeof thresholds] || thresholds.api;

    if (duration < threshold.fast) return '🚀 FAST';
    if (duration < threshold.slow) return '⚠️ SLOW';
    return '🐌 VERY SLOW';
  }

  private getSlowThreshold(type: string): number {
    const thresholds = {
      api: 2000,
      stream: 5000,
      resource: 1000
    };
    return thresholds[type as keyof typeof thresholds] || 2000;
  }

  logSummary(): void {
    const metrics = this.getAllMetrics();
    const completedRequests = metrics.filter(req => req.duration !== undefined);
    
    if (completedRequests.length === 0) {
      productionLogger.debug('No completed requests to summarize');
      return;
    }

    const avgDuration = completedRequests.reduce((sum, req) => sum + (req.duration || 0), 0) / completedRequests.length;
    const slowRequests = completedRequests.filter(req => req.duration! > 2000);
    const errorRequests = completedRequests.filter(req => req.error || (req.status && req.status >= 400));

    const summary = {
      totalRequests: completedRequests.length,
      averageDuration: `${avgDuration.toFixed(2)}ms`,
      slowRequestCount: slowRequests.length,
      errorRequestCount: errorRequests.length,
      successRate: `${((completedRequests.length - errorRequests.length) / completedRequests.length * 100).toFixed(1)}%`,
      typeBreakdown: this.getTypeBreakdown(completedRequests)
    };

    productionLogger.info('Network Performance Summary', summary);
  }

  private getTypeBreakdown(requests: NetworkRequest[]) {
    const breakdown = { api: 0, stream: 0, resource: 0 };
    requests.forEach(req => {
      if (breakdown.hasOwnProperty(req.type)) {
        breakdown[req.type]++;
      }
    });
    return breakdown;
  }
}

// Global tracker instance
const networkTracker = new NetworkPerformanceTracker();

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

// Export the global tracker for direct use
export { networkTracker };