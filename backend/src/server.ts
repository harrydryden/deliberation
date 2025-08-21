import Fastify from 'fastify';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { createRedisClient } from './utils/redis';
import { registerPlugins } from './plugins';
import { registerRoutes } from './routes';
import { setupWebSocket } from './websocket';
import { logger } from './utils/logger';
import { config } from './config';

const prisma = new PrismaClient({
  log: config.env === 'production' ? ['warn', 'error'] : ['query', 'info', 'warn', 'error'],
});

const fastify = Fastify({
  logger: logger,
  requestIdLogLabel: 'traceId',
  requestIdHeader: 'x-trace-id',
  genReqId: () => `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
});

async function buildServer() {
  try {
    // Register plugins
    await registerPlugins(fastify);

    // Setup database connection
    fastify.decorate('prisma', prisma);
    
    // Setup Redis connection
    const redis = createRedisClient();
    try { await (redis as any).connect?.(); } catch {}
    fastify.decorate('redis', redis);

    // Register routes
    await registerRoutes(fastify);

    // Setup WebSocket for real-time features
    const io = new Server(fastify.server, {
      cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    fastify.decorate('io', io);
    setupWebSocket(io, prisma);

    // Health check endpoint with short cache
    let lastHealth: any = null;
    let lastHealthTs = 0;
    fastify.get('/health', async (request, reply) => {
      try {
        const now = Date.now();
        if (lastHealth && now - lastHealthTs < 5000) {
          return lastHealth;
        }

        // Check database connectivity
        await prisma.$queryRaw`SELECT 1`;
        
        // Check Redis connectivity
        await fastify.redis.ping();

        const payload = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: process.env.npm_package_version || '1.0.0',
          environment: config.env,
          services: {
            database: 'healthy',
            redis: 'healthy',
          },
        };
        lastHealth = payload;
        lastHealthTs = now;
        return payload;
      } catch (error) {
        reply.status(503);
        return {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      fastify.log.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        await fastify.close();
        await prisma.$disconnect();
        await fastify.redis.quit();
        process.exit(0);
      } catch (error) {
        fastify.log.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return fastify;
  } catch (error) {
    fastify.log.error('Error building server:', error);
    throw error;
  }
}

async function start() {
  try {
    const server = await buildServer();
    
    await server.listen({
      port: config.port,
      host: config.host,
    });

    server.log.info(`Server listening on http://${config.host}:${config.port}`);
    server.log.info(`Environment: ${config.env}`);
  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

export { buildServer };