// Network performance tracking - separated from hooks to prevent hook violations
import { logger } from '@/utils/logger';

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

export class NetworkPerformanceTracker {
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

    logger.info(`Starting ${type} request: ${method} ${url}`, {
      id,
      timestamp: new Date().toISOString().slice(11, 23)
    });
  }

  endRequest(id: string, status?: number, size?: number, error?: string): NetworkRequest | null {
    const request = this.requests.get(id);
    if (!request) {
      logger.warn(`No request found for ID: ${id}`);
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

    logger.info(`Completed ${request.type} request: ${request.method} ${request.url}`, {
      id,
      duration: `${request.duration.toFixed(2)}ms`,
      status: status || 'unknown',
      size: sizeInfo,
      performance: performanceGrade,
      error: error || 'none'
    });

    // Log slow requests
    if (request.duration > this.getSlowThreshold(request.type)) {
      logger.warn(`Slow ${request.type} request detected`, {
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

    if (duration < threshold.fast) return ' FAST';
    if (duration < threshold.slow) return ' SLOW';
    return '� VERY SLOW';
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
      logger.debug('No completed requests to summarize');
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

    logger.info('Network Performance Summary', summary);
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

// Global tracker instance for use outside React components
export const networkTracker = new NetworkPerformanceTracker();