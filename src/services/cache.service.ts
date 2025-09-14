// Lightweight request deduplication service - production optimized
import { isProduction } from '@/utils/productionConfig';
import { logger } from '@/utils/logger';

export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
}

export class CacheService {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private pendingRequests = new Map<string, Promise<any>>();
  private maxSize: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: CacheOptions = {}) {
    // Smaller cache size in production to reduce memory usage
    this.maxSize = isProduction ? 50 : (options.maxSize || 100);
    
    // Start automatic cleanup timer to prevent memory leaks
    this.startPeriodicCleanup();
  }
  
  // Periodic cleanup to prevent unbounded memory growth
  private startPeriodicCleanup(): void {
    // More frequent cleanup in production to manage memory better
    const interval = isProduction ? 60000 : 120000; // 1min in prod, 2min in dev
    
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, interval);
  }
  
  // Cleanup on service destruction
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  // Generate cache key from function name and arguments
  private generateKey(namespace: string, args: any[]): string {
    return `${namespace}:${JSON.stringify(args)}`;
  }

  // Check if cache entry is valid
  private isValid(entry: { data: any; timestamp: number; ttl: number }): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  // Clean up expired entries with batching to prevent performance issues
  private cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;
    const maxDeletions = 20; // Batch delete to prevent blocking
    
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
        deletedCount++;
        
        // Prevent excessive deletions in one cleanup cycle
        if (deletedCount >= maxDeletions) {
          break;
        }
      }
    }
    
    if (deletedCount > 0 && !isProduction) {
      logger.info('Cache cleanup completed', { deletedCount });
    }
  }

  // Cache and deduplicate async operations
  async memoizeAsync<T>(
    namespace: string,
    args: any[],
    asyncFn: () => Promise<T>,
    options: { ttl?: number } = {}
  ): Promise<T> {
    const key = this.generateKey(namespace, args);
    const ttl = options.ttl || 5000; // Default 5 seconds for faster updates

    // Check cache first
    const cached = this.cache.get(key);
    if (cached && this.isValid(cached)) {
      if (!isProduction) {
        logger.debug(`Cache hit: ${namespace}`);
      }
      return cached.data;
    }

    // Check if request is already pending (deduplication)
    const pending = this.pendingRequests.get(key);
    if (pending) {
      if (!isProduction) {
        logger.debug(`Request deduplicated: ${namespace}`);
      }
      return pending;
    }

    // Execute the request
    const promise = asyncFn().then(data => {
      // Cache the result
      this.cache.set(key, { data, timestamp: Date.now(), ttl });
      this.pendingRequests.delete(key);
      
      // Cleanup if cache is too large
      if (this.cache.size > this.maxSize) {
        this.cleanup();
      }
      
      if (!isProduction) {
        logger.debug(`Cache miss: ${namespace}`);
      }
      return data;
    }).catch(error => {
      // Remove failed request from pending
      this.pendingRequests.delete(key);
      throw error;
    });

    this.pendingRequests.set(key, promise);
    return promise;
  }

  // Clear cache for a specific namespace
  clearNamespace(namespace: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(namespace + ':')) {
        this.cache.delete(key);
      }
    }
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  // Get cache statistics
  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      maxSize: this.maxSize
    };
  }
}

// Global cache instance - smaller in production
export const cacheService = new CacheService({ 
  maxSize: isProduction ? 50 : 200 
});