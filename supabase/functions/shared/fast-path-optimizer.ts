// Fast-path optimization system for common queries and responses
// Provides aggressive caching and pattern matching for frequently asked questions

interface FastPathPattern {
  id: string;
  regex: RegExp;
  agent: string;
  confidence: number;
  category: string;
  templateResponse?: string;
  cacheKey: string;
}

interface CachedResponse {
  content: string;
  agentType: string;
  timestamp: number;
  hitCount: number;
  lastUsed: number;
}

// Enhanced fast-path patterns with more comprehensive coverage
const FAST_PATH_PATTERNS: FastPathPattern[] = [
  // Policy and legislation queries
  {
    id: 'countries_assisted_dying',
    regex: /^(what|which|how many|list)\s+(countries|nations|jurisdictions)\s+(have|allow|permit|legalized|legalised)\s+(assisted dying|euthanasia|MAID)/i,
    agent: 'bill_agent',
    confidence: 0.98,
    category: 'policy_overview',
    cacheKey: 'countries_assisted_dying_overview'
  },
  {
    id: 'safeguards_requirements',
    regex: /^what\s+(specific\s+)?(safeguards|protections|requirements|criteria)\s+(are|exist|in place)/i,
    agent: 'bill_agent',
    confidence: 0.97,
    category: 'policy_safeguards',
    cacheKey: 'safeguards_overview'
  },
  {
    id: 'eligibility_criteria',
    regex: /^(who|what)\s+(is\s+)?(eligible|qualifies|can access)\s+(for\s+)?(assisted dying|MAID|euthanasia)/i,
    agent: 'bill_agent',
    confidence: 0.96,
    category: 'eligibility',
    cacheKey: 'eligibility_criteria'
  },
  {
    id: 'legal_process',
    regex: /^(what|how)\s+(is\s+)?(the\s+)?(legal\s+)?(process|procedure|steps)\s+(for\s+)?(assisted dying|MAID)/i,
    agent: 'bill_agent',
    confidence: 0.95,
    category: 'legal_process',
    cacheKey: 'legal_process_overview'
  },

  // Participant and peer perspective queries
  {
    id: 'participant_views',
    regex: /^(what did|what have|have any)\s+(other\s+)?(participants|people|users)\s+(said|mentioned|shared|contributed)/i,
    agent: 'peer_agent',
    confidence: 0.96,
    category: 'participant_perspectives',
    cacheKey: 'participant_views'
  },
  {
    id: 'common_concerns',
    regex: /^what\s+(are\s+)?(the\s+)?(main|common|key)\s+(concerns|issues|worries)\s+(people|participants)\s+(have|raised)/i,
    agent: 'peer_agent',
    confidence: 0.94,
    category: 'common_concerns',
    cacheKey: 'common_concerns'
  },
  {
    id: 'different_perspectives',
    regex: /^(what|how)\s+(are\s+)?(the\s+)?(different|various)\s+(perspectives|views|opinions)\s+(on|about)/i,
    agent: 'peer_agent',
    confidence: 0.93,
    category: 'perspective_diversity',
    cacheKey: 'different_perspectives'
  },

  // Flow and clarification queries
  {
    id: 'next_steps',
    regex: /^what\s+(are\s+)?(the\s+)?(next\s+)?(steps|actions|things to do)/i,
    agent: 'flow_agent',
    confidence: 0.95,
    category: 'next_steps',
    cacheKey: 'next_steps'
  },
  {
    id: 'help_guidance',
    regex: /^(can you|could you|how do i|what should i)\s+(help|guide|assist|support)/i,
    agent: 'flow_agent',
    confidence: 0.94,
    category: 'guidance',
    cacheKey: 'help_guidance'
  },
  {
    id: 'clarification_request',
    regex: /^(can you|could you|please)\s+(clarify|explain|elaborate)\s+(on|about|what|why|how)/i,
    agent: 'flow_agent',
    confidence: 0.93,
    category: 'clarification',
    cacheKey: 'clarification_help'
  },

  // General information queries
  {
    id: 'what_is_assisted_dying',
    regex: /^what\s+(is|are)\s+(assisted dying|MAID|euthanasia)/i,
    agent: 'bill_agent',
    confidence: 0.97,
    category: 'definition',
    cacheKey: 'assisted_dying_definition'
  },
  {
    id: 'difference_between_terms',
    regex: /^what(\s+is|'s)\s+(the\s+)?(difference|distinction)\s+between\s+(assisted dying|MAID|euthanasia)/i,
    agent: 'bill_agent',
    confidence: 0.96,
    category: 'terminology',
    cacheKey: 'terminology_differences'
  }
];

// Advanced caching system with LRU eviction and statistics
class FastPathCache {
  private cache = new Map<string, CachedResponse>();
  private readonly MAX_SIZE = 100;
  private readonly TTL = 30 * 60 * 1000; // 30 minutes
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalRequests: 0
  };

  get(key: string): CachedResponse | null {
    this.stats.totalRequests++;
    
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    entry.hitCount++;
    entry.lastUsed = Date.now();
    this.stats.hits++;

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry;
  }

  set(key: string, content: string, agentType: string): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.MAX_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    this.cache.set(key, {
      content,
      agentType,
      timestamp: Date.now(),
      hitCount: 0,
      lastUsed: Date.now()
    });
  }

  has(key: string): boolean {
    return this.cache.has(key) && this.get(key) !== null;
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    const hitRate = this.stats.totalRequests > 0 
      ? (this.stats.hits / this.stats.totalRequests * 100).toFixed(2)
      : '0.00';

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      cacheSize: this.cache.size,
      maxSize: this.MAX_SIZE
    };
  }

  // Get most popular cached items
  getPopularItems(limit: number = 10) {
    return Array.from(this.cache.entries())
      .sort(([, a], [, b]) => b.hitCount - a.hitCount)
      .slice(0, limit)
      .map(([key, value]) => ({
        key,
        hitCount: value.hitCount,
        agentType: value.agentType,
        lastUsed: new Date(value.lastUsed).toISOString()
      }));
  }
}

// Global cache instance
const fastPathCache = new FastPathCache();

// Enhanced fast-path checker with confidence scoring and category matching
export function checkFastPath(content: string): { 
  agent: string; 
  confidence: number; 
  pattern: FastPathPattern;
  cached?: CachedResponse;
} | null {
  const trimmedContent = content.trim().toLowerCase();
  
  // Check for exact cache matches first
  for (const pattern of FAST_PATH_PATTERNS) {
    if (pattern.regex.test(content)) {
      console.log(`🎯 Fast path pattern matched: "${pattern.id}" -> ${pattern.agent} (confidence: ${pattern.confidence})`);
      
      // Check cache for this pattern
      const cached = fastPathCache.get(pattern.cacheKey);
      
      return {
        agent: pattern.agent,
        confidence: pattern.confidence,
        pattern,
        cached
      };
    }
  }

  // Fuzzy matching for near-matches (reduced confidence)
  for (const pattern of FAST_PATH_PATTERNS) {
    const patternWords = pattern.regex.source
      .replace(/[^a-zA-Z\s]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2);

    const contentWords = trimmedContent.split(/\s+/);
    const matchedWords = patternWords.filter(word => 
      contentWords.some(cWord => cWord.includes(word) || word.includes(cWord))
    );

    const matchRatio = matchedWords.length / patternWords.length;
    
    if (matchRatio >= 0.7) { // 70% word match threshold
      const adjustedConfidence = pattern.confidence * matchRatio * 0.8; // Reduce confidence for fuzzy matches
      
      console.log(`🎯 Fuzzy fast path match: "${pattern.id}" -> ${pattern.agent} (confidence: ${adjustedConfidence.toFixed(2)})`);
      
      return {
        agent: pattern.agent,
        confidence: adjustedConfidence,
        pattern,
        cached: fastPathCache.get(pattern.cacheKey)
      };
    }
  }

  return null;
}

// Cache a successful fast-path response
export function cacheFastPathResponse(pattern: FastPathPattern, content: string, agentType: string): void {
  fastPathCache.set(pattern.cacheKey, content, agentType);
  console.log(`💾 Cached fast-path response for pattern: ${pattern.id}`);
}

// Get cache statistics for monitoring
export function getFastPathStats() {
  return {
    cache: fastPathCache.getStats(),
    patterns: {
      total: FAST_PATH_PATTERNS.length,
      byAgent: FAST_PATH_PATTERNS.reduce((acc, pattern) => {
        acc[pattern.agent] = (acc[pattern.agent] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byCategory: FAST_PATH_PATTERNS.reduce((acc, pattern) => {
        acc[pattern.category] = (acc[pattern.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    },
    popular: fastPathCache.getPopularItems(5)
  };
}

// Clear cache (for testing or maintenance)
export function clearFastPathCache(): void {
  fastPathCache.clear();
}

// Preload common responses (can be called on startup)
export async function preloadFastPathResponses(supabase: any): Promise<void> {
  console.log('🚀 Preloading fast-path responses...');
  
  // This could be expanded to preload from database or configuration
  // For now, we just log the initialization
  const stats = getFastPathStats();
  console.log('📊 Fast-path system initialized:', stats);
}