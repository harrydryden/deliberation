import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

let redisClient: Redis | null = null;

// Circuit breaker states
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN', 
  HALF_OPEN = 'HALF_OPEN'
}

// Circuit breaker for Redis operations
class RedisCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  // Circuit breaker configuration
  private readonly failureThreshold = 5;
  private readonly recoveryTimeout = 30000; // 30 seconds
  private readonly successThreshold = 3;

  shouldAllowRequest(): boolean {
    const now = Date.now();
    
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;
        
      case CircuitState.OPEN:
        if (now - this.lastFailureTime >= this.recoveryTimeout) {
          this.state = CircuitState.HALF_OPEN;
          this.successCount = 0;
          logger.info('Circuit breaker transitioning to HALF_OPEN');
          return true;
        }
        return false;
        
      case CircuitState.HALF_OPEN:
        return true;
        
      default:
        return false;
    }
  }

  onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        logger.info('Circuit breaker transitioning to CLOSED');
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
    }
  }

  onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      logger.warn('Circuit breaker transitioning to OPEN from HALF_OPEN');
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.warn('Circuit breaker transitioning to OPEN due to failure threshold');
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Retry utility with exponential backoff
class RetryHandler {
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelay: number = 1000,
    maxDelay: number = 10000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
        
        // Calculate exponential backoff with jitter
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
          maxDelay
        );
        
        logger.warn(
          { attempt, delay, error: error.message },
          'Redis operation failed, retrying'
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
}

const circuitBreaker = new RedisCircuitBreaker();

export function createRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(config.redisUrl, {
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    family: 4,
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  redisClient.on('ready', () => {
    logger.info('Redis ready');
  });

  redisClient.on('error', (error) => {
    logger.error({ error }, 'Redis error');
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', () => {
    logger.info('Redis reconnecting');
  });

  return redisClient;
}

// Token bucket rate limiter implementation
export class TokenBucket {
  private bucket: string;
  private capacity: number;
  private refillRate: number;
  private refillInterval: number;
  private redis: Redis;

  constructor(
    key: string,
    capacity: number = config.tokenBucket.capacity,
    refillRate: number = config.tokenBucket.refillRate,
    refillInterval: number = config.tokenBucket.refillInterval
  ) {
    this.bucket = `token_bucket:${key}`;
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.refillInterval = refillInterval;
    this.redis = createRedisClient();
  }

  async consume(tokens: number = 1): Promise<{ allowed: boolean; tokensRemaining: number; retryAfter?: number }> {
    // Check circuit breaker first
    if (!circuitBreaker.shouldAllowRequest()) {
      logger.warn('Redis circuit breaker is OPEN, falling back to permissive rate limiting');
      return this.fallbackRateLimit(tokens);
    }

    try {
      const result = await RetryHandler.executeWithRetry(async () => {
        const now = Date.now();
        const script = `
          local bucket = KEYS[1]
          local capacity = tonumber(ARGV[1])
          local refillRate = tonumber(ARGV[2])
          local refillInterval = tonumber(ARGV[3])
          local tokens = tonumber(ARGV[4])
          local now = tonumber(ARGV[5])
          
          local bucket_data = redis.call('HMGET', bucket, 'tokens', 'lastRefill')
          local currentTokens = tonumber(bucket_data[1]) or capacity
          local lastRefill = tonumber(bucket_data[2]) or now
          
          -- Calculate tokens to add based on time elapsed
          local timePassed = now - lastRefill
          local tokensToAdd = math.floor(timePassed / refillInterval) * refillRate
          currentTokens = math.min(capacity, currentTokens + tokensToAdd)
          
          -- Check if request can be satisfied
          if currentTokens >= tokens then
            currentTokens = currentTokens - tokens
            redis.call('HMSET', bucket, 'tokens', currentTokens, 'lastRefill', now)
            redis.call('EXPIRE', bucket, math.max( math.floor(refillInterval/1000) * 120, 60)) -- TTL ~2 minutes of refill windows, min 60s
            return {1, currentTokens, 0} -- allowed, remaining, retryAfter
          else
            redis.call('HMSET', bucket, 'tokens', currentTokens, 'lastRefill', now)
            redis.call('EXPIRE', bucket, math.max( math.floor(refillInterval/1000) * 120, 60))
            local retryAfter = math.ceil((tokens - currentTokens) / refillRate) * refillInterval
            return {0, currentTokens, retryAfter} -- not allowed, remaining, retryAfter
          end
        `;

        return await this.redis.eval(
          script,
          1,
          this.bucket,
          this.capacity.toString(),
          this.refillRate.toString(),
          this.refillInterval.toString(),
          tokens.toString(),
          now.toString()
        ) as [number, number, number];
      });

      circuitBreaker.onSuccess();

      return {
        allowed: result[0] === 1,
        tokensRemaining: result[1],
        retryAfter: result[2] > 0 ? result[2] : undefined,
      };
    } catch (error) {
      circuitBreaker.onFailure();
      logger.error({ error, bucket: this.bucket }, 'Token bucket operation failed, using fallback');
      return this.fallbackRateLimit(tokens);
    }
  }

  // Fallback rate limiting when Redis is unavailable
  private fallbackRateLimit(tokens: number): { allowed: boolean; tokensRemaining: number; retryAfter?: number } {
    // Simple in-memory fallback with conservative limits
    const fallbackCapacity = Math.min(this.capacity, 10); // More restrictive when Redis is down
    
    logger.info(
      { bucket: this.bucket, fallbackCapacity, requestedTokens: tokens },
      'Using fallback rate limiting'
    );
    
    return {
      allowed: tokens <= fallbackCapacity,
      tokensRemaining: Math.max(0, fallbackCapacity - tokens),
      retryAfter: tokens > fallbackCapacity ? 60000 : undefined, // 1 minute retry for fallback
    };
  }
}

// Cache utilities
export class CacheManager {
  private redis: Redis;
  private memoryCache: Map<string, { value: any; expiry: number }> = new Map();

  constructor() {
    this.redis = createRedisClient();
    
    // Clean up expired memory cache entries periodically
    setInterval(() => this.cleanupMemoryCache(), 60000); // Every minute
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiry <= now) {
        this.memoryCache.delete(key);
      }
    }
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    // Always update memory cache for fallback
    const expiry = Date.now() + (ttlSeconds * 1000);
    this.memoryCache.set(key, { value, expiry });

    if (!circuitBreaker.shouldAllowRequest()) {
      logger.warn({ key }, 'Redis circuit breaker is OPEN, using memory cache only');
      return;
    }

    try {
      await RetryHandler.executeWithRetry(async () => {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
      });
      circuitBreaker.onSuccess();
    } catch (error) {
      circuitBreaker.onFailure();
      logger.warn({ error, key }, 'Redis set failed, value stored in memory cache only');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    // Try Redis first if circuit breaker allows
    if (circuitBreaker.shouldAllowRequest()) {
      try {
        const result = await RetryHandler.executeWithRetry(async () => {
          const value = await this.redis.get(key);
          return value ? JSON.parse(value) : null;
        });
        circuitBreaker.onSuccess();
        
        if (result !== null) {
          return result;
        }
      } catch (error) {
        circuitBreaker.onFailure();
        logger.warn({ error, key }, 'Redis get failed, trying memory cache fallback');
      }
    }

    // Fallback to memory cache
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && memoryEntry.expiry > Date.now()) {
      logger.debug({ key }, 'Cache hit from memory fallback');
      return memoryEntry.value;
    }

    return null;
  }

  async del(key: string): Promise<void> {
    // Remove from memory cache immediately
    this.memoryCache.delete(key);

    if (!circuitBreaker.shouldAllowRequest()) {
      logger.warn({ key }, 'Redis circuit breaker is OPEN, deleted from memory cache only');
      return;
    }

    try {
      await RetryHandler.executeWithRetry(async () => {
        await this.redis.del(key);
      });
      circuitBreaker.onSuccess();
    } catch (error) {
      circuitBreaker.onFailure();
      logger.warn({ error, key }, 'Redis delete failed, removed from memory cache only');
    }
  }

  async exists(key: string): Promise<boolean> {
    // Try Redis first if circuit breaker allows
    if (circuitBreaker.shouldAllowRequest()) {
      try {
        const result = await RetryHandler.executeWithRetry(async () => {
          return (await this.redis.exists(key)) === 1;
        });
        circuitBreaker.onSuccess();
        return result;
      } catch (error) {
        circuitBreaker.onFailure();
        logger.warn({ error, key }, 'Redis exists failed, checking memory cache fallback');
      }
    }

    // Fallback to memory cache
    const memoryEntry = this.memoryCache.get(key);
    return memoryEntry !== undefined && memoryEntry.expiry > Date.now();
  }

  // Cache classification results
  async cacheClassification(input: string, result: string): Promise<void> {
    const key = `classification:${this.hash(input)}`;
    await this.set(key, result, 3600); // 1 hour TTL
  }

  async getCachedClassification(input: string): Promise<string | null> {
    const key = `classification:${this.hash(input)}`;
    return this.get(key);
  }

  // Cache relevance results  
  async cacheRelevance(query: string, content: string, score: number): Promise<void> {
    const key = `relevance:${this.hash(query + content)}`;
    await this.set(key, score, 1800); // 30 minutes TTL
  }

  async getCachedRelevance(query: string, content: string): Promise<number | null> {
    const key = `relevance:${this.hash(query + content)}`;
    return this.get(key);
  }

  // Cache safety check results
  async cacheSafetyCheck(content: string, result: any): Promise<void> {
    const key = `safety:${this.hash(content)}`;
    await this.set(key, result, 7200); // 2 hours TTL
  }

  async getCachedSafetyCheck(content: string): Promise<any | null> {
    const key = `safety:${this.hash(content)}`;
    return this.get(key);
  }

  private hash(input: string): string {
    // Lightweight 53-bit hash to avoid heavy crypto dep; acceptable for cache keys
    let h1 = 0xdeadbeef ^ input.length, h2 = 0x41c6ce57 ^ input.length;
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = (Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)) >>> 0;
    h2 = (Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)) >>> 0;
    return (h2 * 4294967296 + h1).toString(36);
  }
}