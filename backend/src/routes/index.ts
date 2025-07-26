import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { messageRoutes } from './messages';
import { agentRoutes } from './agents';
import { deliberationRoutes } from './deliberations';
import { sseRoutes } from './sse';

export async function registerRoutes(fastify: FastifyInstance) {
  // API prefix
  await fastify.register(async function(fastify) {
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
    
  }, { prefix: '/api/v1' });
}