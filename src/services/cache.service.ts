// Request deduplication and caching service
import { createMemoCache } from '@/utils/performanceUtils';
import { logger } from '@/utils/logger';

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number;
}

export class CacheService {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private pendingRequests = new Map<string, Promise<any>>();
  private maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 100;
  }

  // Generate cache key from function name and arguments
  private generateKey(namespace: string, args: any[]): string {
    return `${namespace}:${JSON.stringify(args)}`;
  }

  // Check if cache entry is valid
  private isValid(entry: { data: any; timestamp: number; ttl: number }): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  // Clean up expired entries
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
      }
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
    const ttl = options.ttl || 30000; // Default 30 seconds

    // Check cache first
    const cached = this.cache.get(key);
    if (cached && this.isValid(cached)) {
      logger.performance.mark(`Cache hit: ${namespace}`);
      return cached.data;
    }

    // Check if request is already pending (deduplication)
    const pending = this.pendingRequests.get(key);
    if (pending) {
      logger.performance.mark(`Request deduplicated: ${namespace}`);
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
      
      logger.performance.mark(`Cache miss: ${namespace}`);
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

// Global cache instance
export const cacheService = new CacheService({ maxSize: 200 });