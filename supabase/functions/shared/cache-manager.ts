// Centralized cache management with automatic cleanup and memory limits
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
  lastAccessed: number;
}

export interface CacheOptions {
  maxSize?: number;
  ttlMs?: number;
  cleanupIntervalMs?: number;
}

export class MemoryCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private cleanupTimer: number | null = null;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    cleanups: 0
  };

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttlMs = options.ttlMs || 5 * 60 * 1000; // 5 minutes default
    
    // Start automatic cleanup
    const cleanupInterval = options.cleanupIntervalMs || 60 * 1000; // 1 minute
    this.scheduleCleanup(cleanupInterval);
  }

  set(key: string, data: T): void {
    const now = Date.now();
    
    // Enforce size limit before adding
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      data,
      timestamp: now,
      lastAccessed: now,
      hits: 0
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    const now = Date.now();
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    if ((now - entry.timestamp) > this.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Update access stats
    entry.hits++;
    entry.lastAccessed = now;
    this.stats.hits++;
    
    return entry.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.stats.cleanups++;
  }

  // Get cache statistics
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
    };
  }

  // Evict least recently used items
  private evictLRU(): void {
    if (this.cache.size === 0) return;
    
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  // Remove expired entries
  private cleanupExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if ((now - entry.timestamp) > this.ttlMs) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0) {
      this.stats.cleanups++;
    }
  }

  // Schedule periodic cleanup
  private scheduleCleanup(intervalMs: number): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, intervalMs);
  }

  // Cleanup resources
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

// Global cache instances for different purposes
export const responseCache = new MemoryCache<string>({
  maxSize: 500,
  ttlMs: 30 * 60 * 1000, // 30 minutes
  cleanupIntervalMs: 5 * 60 * 1000 // 5 minutes cleanup
});

export const configCache = new MemoryCache<any>({
  maxSize: 100,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  cleanupIntervalMs: 60 * 1000 // 1 minute cleanup
});

export const templateCache = new MemoryCache<any>({
  maxSize: 50,
  ttlMs: 10 * 60 * 1000, // 10 minutes
  cleanupIntervalMs: 2 * 60 * 1000 // 2 minutes cleanup
});

// Utility function to generate cache keys
export function createCacheKey(...parts: (string | number | undefined)[]): string {
  return parts
    .filter(part => part !== undefined)
    .map(part => String(part).toLowerCase())
    .join(':');
}