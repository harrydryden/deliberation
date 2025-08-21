import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from '../config';
import { createRequestLogger } from '../utils/logger';
import { TokenBucket } from '../utils/redis';

export async function registerPlugins(fastify: FastifyInstance) {
  // Request logging
  fastify.addHook('onRequest', createRequestLogger());

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "https:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  });

  // CORS
  await fastify.register(cors, {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-trace-id'],
  });

  // JWT authentication (supports custom JWT and optional Supabase JWT)
  await fastify.register(jwt, {
    secret: async (request) => {
      // If the token looks like a Supabase JWT (iss contains supabase.co), use Supabase JWT secret when provided
      const token = fastify.jwt.extractToken(request);
      if (config.supabaseJwtSecret && token) {
        try {
          const header = JSON.parse(Buffer.from(token.split('.')[0] || '', 'base64').toString('utf8'));
          const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64').toString('utf8'));
          if (payload?.iss && typeof payload.iss === 'string' && payload.iss.includes('supabase.co')) {
            return config.supabaseJwtSecret as string;
          }
        } catch {}
      }
      return config.jwtSecret;
    },
    verify: { extractToken: fastify.jwt.extractToken },
  });

  // Rate limiting with Redis store
  await fastify.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    redis: fastify.redis,
    allowList: ['127.0.0.1'],
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise use IP
      const userId = request.user?.id;
      return userId ? `user:${userId}` : `ip:${request.ip}`;
    },
    errorResponseBuilder: (request, context) => ({
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${Math.round(context.ttl / 1000)} seconds.`,
      statusCode: 429,
      retryAfter: context.ttl,
    }),
  });

  // WebSocket support for real-time features
  await fastify.register(websocket);

  // Custom token bucket rate limiter for AI API calls
  fastify.decorate('tokenBucket', (key: string) => new TokenBucket(key));

  // Authentication hook
  fastify.decorate('authenticate', async function(request: any, reply: any) {
    try {
      await request.jwtVerify();
      // Normalize user id for downstream code
      if (request.user && !request.user.id && request.user.sub) {
        request.user.id = request.user.sub;
      }
    } catch (err) {
      reply.status(401).send({ error: 'Authentication required' });
    }
  });

  // Optional authentication (doesn't fail if no token)
  fastify.decorate('optionalAuth', async function(request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      // Silent fail - user just won't be authenticated
      request.user = null;
    }
  });

  // AI rate limiting hook
  fastify.decorate('aiRateLimit', async function(request: any, reply: any) {
    const userId = request.user?.id || request.ip;
    const bucket = new TokenBucket(`ai:${userId}`, 50, 1, 60000); // 50 tokens, 1 per minute
    
    const result = await bucket.consume(1);
    
    if (!result.allowed) {
      reply.status(429).send({
        error: 'AI rate limit exceeded',
        message: 'Too many AI requests. Please wait before trying again.',
        retryAfter: result.retryAfter,
      });
      return;
    }
    
    // Add remaining tokens to response headers
    reply.header('X-RateLimit-Remaining', result.tokensRemaining.toString());
  });

  // Error handling
  fastify.setErrorHandler((error, request, reply) => {
    const traceId = request.id;
    
    fastify.log.error({
      traceId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers,
      },
    }, 'Request error');

    // Don't expose internal errors in production
    if (config.env === 'production' && error.statusCode >= 500) {
      reply.status(error.statusCode || 500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        traceId,
      });
    } else {
      reply.status(error.statusCode || 500).send({
        error: error.name || 'Error',
        message: error.message,
        traceId,
        ...(config.env === 'development' && { stack: error.stack }),
      });
    }
  });

  // Not found handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    });
  });
}