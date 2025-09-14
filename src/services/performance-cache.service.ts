// High-performance caching service for UI optimizations
class PerformanceCacheService {
  private stringCache = new Map<string, string>();
  private computationCache = new Map<string, any>();
  private readonly maxCacheSize = 1000;

  // PERFORMANCE: String truncation cache
  memoizeTruncatedString(text: string, maxLength: number): string {
    const cacheKey = `truncate:${text}:${maxLength}`;
    
    if (this.stringCache.has(cacheKey)) {
      return this.stringCache.get(cacheKey)!;
    }

    const result = text.length > maxLength 
      ? text.slice(0, maxLength) + '...'
      : text;

    // LRU cache management
    if (this.stringCache.size >= this.maxCacheSize) {
      const firstKey = this.stringCache.keys().next().value;
      this.stringCache.delete(firstKey);
    }

    this.stringCache.set(cacheKey, result);
    return result;
  }

  // PERFORMANCE: Generic computation cache
  memoizeComputation<T>(key: string, computation: () => T, ttl = 30000): T {
    const now = Date.now();
    const cached = this.computationCache.get(key);

    if (cached && (now - cached.timestamp < ttl)) {
      return cached.value;
    }

    const result = computation();
    this.computationCache.set(key, {
      value: result,
      timestamp: now
    });

    return result;
  }

  // Cache cleanup
  clear() {
    this.stringCache.clear();
    this.computationCache.clear();
  }

  // Get cache stats
  getStats() {
    return {
      stringCacheSize: this.stringCache.size,
      computationCacheSize: this.computationCache.size,
      totalSize: this.stringCache.size + this.computationCache.size
    };
  }
}

export const performanceCacheService = new PerformanceCacheService();