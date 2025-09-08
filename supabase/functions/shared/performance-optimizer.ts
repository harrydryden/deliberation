// Performance optimization utilities for edge functions
// Enhanced timeout and parallel processing controls

interface TimeoutConfig {
  individual: number; // Individual operation timeout
  total: number; // Total orchestration timeout
  retryDelay: number; // Base delay between retries
}

// Default timeout configuration
export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  individual: 10000, // 10 seconds per operation
  total: 20000, // 20 seconds total
  retryDelay: 1000 // 1 second base delay
};

// Enhanced timeout wrapper with graceful degradation
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string = 'operation',
  fallbackValue?: T
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } catch (error) {
    console.warn(`⏰ ${operation} timed out or failed:`, error);
    
    if (fallbackValue !== undefined) {
      console.log(`🔄 Using fallback value for ${operation}`);
      return fallbackValue;
    }
    
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Tiered parallel processing with progressive timeouts
export async function executeTieredOperations<T>(
  operations: {
    critical: Array<{ name: string; fn: () => Promise<T>; fallback?: T }>;
    secondary: Array<{ name: string; fn: () => Promise<T>; fallback?: T }>;
    optional: Array<{ name: string; fn: () => Promise<T>; fallback?: T }>;
  },
  config: TimeoutConfig = DEFAULT_TIMEOUTS
): Promise<{
  critical: Record<string, T | null>;
  secondary: Record<string, T | null>;
  optional: Record<string, T | null>;
  totalTime: number;
}> {
  const startTime = Date.now();
  const results = {
    critical: {} as Record<string, T | null>,
    secondary: {} as Record<string, T | null>,
    optional: {} as Record<string, T | null>,
    totalTime: 0
  };

  // Tier 1: Critical operations (5 seconds each, parallel)
  console.log('🚀 Executing Tier 1 (Critical) operations...');
  const criticalPromises = operations.critical.map(async (op) => {
    try {
      const result = await withTimeout(
        op.fn(),
        5000,
        `Critical: ${op.name}`,
        op.fallback
      );
      results.critical[op.name] = result;
      console.log(`✅ Critical operation ${op.name} completed`);
    } catch (error) {
      console.warn(`❌ Critical operation ${op.name} failed:`, error);
      results.critical[op.name] = op.fallback || null;
    }
  });

  await Promise.allSettled(criticalPromises);
  
  const criticalTime = Date.now() - startTime;
  console.log(`📊 Tier 1 completed in ${criticalTime}ms`);

  // Check total timeout before proceeding
  if (criticalTime > config.total * 0.6) {
    console.warn('⏰ Running out of time, skipping secondary operations');
    results.totalTime = Date.now() - startTime;
    return results;
  }

  // Tier 2: Secondary operations (7 seconds each, parallel)
  console.log('🔄 Executing Tier 2 (Secondary) operations...');
  const secondaryPromises = operations.secondary.map(async (op) => {
    try {
      const result = await withTimeout(
        op.fn(),
        7000,
        `Secondary: ${op.name}`,
        op.fallback
      );
      results.secondary[op.name] = result;
      console.log(`✅ Secondary operation ${op.name} completed`);
    } catch (error) {
      console.warn(`❌ Secondary operation ${op.name} failed:`, error);
      results.secondary[op.name] = op.fallback || null;
    }
  });

  await Promise.allSettled(secondaryPromises);
  
  const secondaryTime = Date.now() - startTime;
  console.log(`📊 Tier 2 completed in ${secondaryTime}ms`);

  // Check total timeout before optional operations
  if (secondaryTime > config.total * 0.8) {
    console.warn('⏰ Running out of time, skipping optional operations');
    results.totalTime = Date.now() - startTime;
    return results;
  }

  // Tier 3: Optional operations (remaining time, parallel)
  const remainingTime = Math.max(1000, config.total - secondaryTime);
  console.log(`🎯 Executing Tier 3 (Optional) operations with ${remainingTime}ms remaining...`);
  
  const optionalPromises = operations.optional.map(async (op) => {
    try {
      const result = await withTimeout(
        op.fn(),
        remainingTime,
        `Optional: ${op.name}`,
        op.fallback
      );
      results.optional[op.name] = result;
      console.log(`✅ Optional operation ${op.name} completed`);
    } catch (error) {
      console.warn(`❌ Optional operation ${op.name} failed:`, error);
      results.optional[op.name] = op.fallback || null;
    }
  });

  await Promise.allSettled(optionalPromises);

  results.totalTime = Date.now() - startTime;
  console.log(`📊 All tiers completed in ${results.totalTime}ms`);

  return results;
}

// Enhanced retry with exponential backoff
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelay: number = 1000,
  operation: string = 'operation'
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt <= maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`🔄 ${operation} attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Memory-efficient cache with TTL
export class OptimizedCache<T> {
  private cache = new Map<string, { data: T; timestamp: number; hits: number }>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number = 200, ttlMs: number = 900000) { // 15 minutes default
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    // Update hit count
    entry.hits++;
    return entry.data;
  }

  set(key: string, data: T): void {
    // Clean up expired entries
    this.cleanup();
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      hits: 0
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      hitRates: Array.from(this.cache.values()).map(e => e.hits)
    };
  }
}