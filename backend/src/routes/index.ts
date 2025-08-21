import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { messageRoutes } from './messages';
import { agentRoutes } from './agents';
import { deliberationRoutes } from './deliberations';
import { sseRoutes } from './sse';
import { streamRoutes } from './stream';

export async function registerRoutes(fastify: FastifyInstance) {
  // API prefix
  await fastify.register(async function(fastify) {
    // Ensure user record exists for Supabase-authenticated requests
    fastify.addHook('preHandler', async (request) => {
      if (request.user?.id) {
        try {
          const userId = request.user.id as string;
          const email = (request.user.email as string) || `${userId}@supabase.local`;
          // Idempotent upsert-like behavior
          const existing = await fastify.prisma.user.findUnique({ where: { id: userId } });
          if (!existing) {
            await fastify.prisma.user.create({ data: { id: userId, email } });
          }
        } catch {}
      }
    });
    // Authentication routes
    await fastify.register(authRoutes, { prefix: '/auth' });
    
    // Message routes (chat functionality)
    await fastify.register(messageRoutes, { prefix: '/messages' });
    
    // Agent routes (AI agents management)
    await fastify.register(agentRoutes, { prefix: '/agents' });
    
    // Deliberation routes
    await fastify.register(deliberationRoutes, { prefix: '/deliberations' });
    
    // Server-Sent Events routes
    await fastify.register(sseRoutes, { prefix: '/sse' });

    // Streaming proxy routes
    await fastify.register(streamRoutes, { prefix: '/stream' });
    
  }, { prefix: '/api/v1' });
}