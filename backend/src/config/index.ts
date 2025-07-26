import { z } from 'zod';

const configSchema = z.object({
  env: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(3000),
  host: z.string().default('0.0.0.0'),
  
  // Database
  databaseUrl: z.string(),
  
  // Redis
  redisUrl: z.string().default('redis://localhost:6379'),
  
  // JWT
  jwtSecret: z.string(),
  jwtExpiresIn: z.string().default('24h'),
  
  // AI Services
  anthropicApiKey: z.string(),
  
  // Rate limiting
  rateLimitMax: z.coerce.number().default(100),
  rateLimitWindow: z.coerce.number().default(60000), // 1 minute
  
  // CORS
  cors: z.object({
    origin: z.union([z.string(), z.array(z.string()), z.boolean()]).default(true),
    credentials: z.boolean().default(true),
  }).default({}),
  
  // Logging
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  
  // Streaming
  sseHeartbeatInterval: z.coerce.number().default(30000), // 30 seconds
  sseMaxConnections: z.coerce.number().default(1000),
  
  // Token bucket rate limiting
  tokenBucket: z.object({
    capacity: z.coerce.number().default(100),
    refillRate: z.coerce.number().default(10), // tokens per second
    refillInterval: z.coerce.number().default(1000), // milliseconds
  }).default({}),
});

function loadConfig() {
  const rawConfig = {
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    host: process.env.HOST,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    rateLimitMax: process.env.RATE_LIMIT_MAX,
    rateLimitWindow: process.env.RATE_LIMIT_WINDOW,
    logLevel: process.env.LOG_LEVEL,
    sseHeartbeatInterval: process.env.SSE_HEARTBEAT_INTERVAL,
    sseMaxConnections: process.env.SSE_MAX_CONNECTIONS,
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || true,
      credentials: process.env.CORS_CREDENTIALS !== 'false',
    },
    tokenBucket: {
      capacity: process.env.TOKEN_BUCKET_CAPACITY,
      refillRate: process.env.TOKEN_BUCKET_REFILL_RATE,
      refillInterval: process.env.TOKEN_BUCKET_REFILL_INTERVAL,
    },
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }
}

export const config = loadConfig();

export type Config = z.infer<typeof configSchema>;