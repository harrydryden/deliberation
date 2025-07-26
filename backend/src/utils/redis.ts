import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

let redisClient: Redis | null = null;

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
        redis.call('EXPIRE', bucket, 3600) -- 1 hour TTL
        return {1, currentTokens, 0} -- allowed, remaining, retryAfter
      else
        redis.call('HMSET', bucket, 'tokens', currentTokens, 'lastRefill', now)
        redis.call('EXPIRE', bucket, 3600)
        local retryAfter = math.ceil((tokens - currentTokens) / refillRate) * refillInterval
        return {0, currentTokens, retryAfter} -- not allowed, remaining, retryAfter
      end
    `;

    const result = await this.redis.eval(
      script,
      1,
      this.bucket,
      this.capacity.toString(),
      this.refillRate.toString(),
      this.refillInterval.toString(),
      tokens.toString(),
      now.toString()
    ) as [number, number, number];

    return {
      allowed: result[0] === 1,
      tokensRemaining: result[1],
      retryAfter: result[2] > 0 ? result[2] : undefined,
    };
  }
}

// Cache utilities
export class CacheManager {
  private redis: Redis;

  constructor() {
    this.redis = createRedisClient();
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  // Cache classification results
  async cacheClassification(input: string, result: string): Promise<void> {
    const key = `classification:${Buffer.from(input).toString('base64')}`;
    await this.set(key, result, 3600); // 1 hour TTL
  }

  async getCachedClassification(input: string): Promise<string | null> {
    const key = `classification:${Buffer.from(input).toString('base64')}`;
    return this.get(key);
  }

  // Cache relevance results  
  async cacheRelevance(query: string, content: string, score: number): Promise<void> {
    const key = `relevance:${Buffer.from(query + content).toString('base64')}`;
    await this.set(key, score, 1800); // 30 minutes TTL
  }

  async getCachedRelevance(query: string, content: string): Promise<number | null> {
    const key = `relevance:${Buffer.from(query + content).toString('base64')}`;
    return this.get(key);
  }

  // Cache safety check results
  async cacheSafetyCheck(content: string, result: any): Promise<void> {
    const key = `safety:${Buffer.from(content).toString('base64')}`;
    await this.set(key, result, 7200); // 2 hours TTL
  }

  async getCachedSafetyCheck(content: string): Promise<any | null> {
    const key = `safety:${Buffer.from(content).toString('base64')}`;
    return this.get(key);
  }
}