interface CacheEntry {
  response: string;
  agentType: string;
  timestamp: number;
  hits: number;
  similarity: number;
}

interface SemanticCacheEntry {
  analysis: any;
  timestamp: number;
  content: string;
}

class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private semanticCache = new Map<string, SemanticCacheEntry>();
  private readonly CACHE_DURATION = 1000 * 60 * 30; // 30 minutes
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly SIMILARITY_THRESHOLD = 0.85;

  // Generate cache key from content
  private generateKey(content: string, context?: string): string {
    const normalized = content.toLowerCase().trim().replace(/\s+/g, ' ');
    return context ? `${context}:${normalized}` : normalized;
  }

  // Simple similarity calculation using Jaccard similarity
  private calculateSimilarity(str1: string, str2: string): number {
    const tokens1 = new Set(str1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(str2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }

  // Find similar cached response
  findSimilarResponse(content: string, deliberationId?: string): CacheEntry | null {
    const now = Date.now();
    const context = deliberationId ? `delib:${deliberationId}` : 'global';
    
    // First try exact match
    const exactKey = this.generateKey(content, context);
    const exact = this.cache.get(exactKey);
    if (exact && (now - exact.timestamp) < this.CACHE_DURATION) {
      exact.hits++;
      return exact;
    }

    // Then try similarity search
    for (const [key, entry] of this.cache.entries()) {
      if ((now - entry.timestamp) > this.CACHE_DURATION) continue;
      
      const similarity = this.calculateSimilarity(content, key.split(':').pop() || key);
      if (similarity >= this.SIMILARITY_THRESHOLD) {
        entry.hits++;
        entry.similarity = similarity;
        return entry;
      }
    }

    return null;
  }

  // Cache a response
  cacheResponse(content: string, response: string, agentType: string, deliberationId?: string): void {
    const context = deliberationId ? `delib:${deliberationId}` : 'global';
    const key = this.generateKey(content, context);
    
    this.cache.set(key, {
      response,
      agentType,
      timestamp: Date.now(),
      hits: 0,
      similarity: 1.0
    });

    // Cleanup old entries if cache is too large
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      this.cleanup();
    }
  }

  // Cache semantic analysis
  cacheSemanticAnalysis(content: string, analysis: any): void {
    const key = this.generateKey(content);
    this.semanticCache.set(key, {
      analysis,
      timestamp: Date.now(),
      content
    });
  }

  // Get cached semantic analysis
  getCachedSemanticAnalysis(content: string): any | null {
    const now = Date.now();
    const key = this.generateKey(content);
    const cached = this.semanticCache.get(key);
    
    if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      return cached.analysis;
    }

    // Try similarity search for semantic analysis
    for (const [_, entry] of this.semanticCache.entries()) {
      if ((now - entry.timestamp) > this.CACHE_DURATION) continue;
      
      const similarity = this.calculateSimilarity(content, entry.content);
      if (similarity >= 0.9) { // Higher threshold for semantic analysis
        return entry.analysis;
      }
    }

    return null;
  }

  // Cleanup old entries
  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    
    // Sort by score (hits / age)
    entries.sort(([, a], [, b]) => {
      const scoreA = a.hits / Math.max(1, (now - a.timestamp) / (1000 * 60 * 60));
      const scoreB = b.hits / Math.max(1, (now - b.timestamp) / (1000 * 60 * 60));
      return scoreB - scoreA;
    });

    // Remove bottom 20%
    const removeCount = Math.floor(entries.length * 0.2);
    for (let i = entries.length - removeCount; i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  // Get cache stats
  getStats(): { size: number; hitRate: number; semanticSize: number } {
    const totalHits = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.hits, 0);
    const totalEntries = this.cache.size;
    
    return {
      size: totalEntries,
      hitRate: totalEntries > 0 ? totalHits / totalEntries : 0,
      semanticSize: this.semanticCache.size
    };
  }

  // Clear cache
  clear(): void {
    this.cache.clear();
    this.semanticCache.clear();
  }
}

export const responseCache = new ResponseCache();