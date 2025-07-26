import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';

const connections = new Map<string, FastifyReply>();

const streamSchema = z.object({
  userId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
});

export async function sseRoutes(fastify: FastifyInstance) {
  // SSE endpoint for token streaming
  fastify.get('/stream/:userId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: streamSchema,
    },
  }, async (request: FastifyRequest<{ Params: z.infer<typeof streamSchema> }>, reply: FastifyReply) => {
    const { userId } = request.params;
    const connectionId = `${userId}-${Date.now()}`;
    
    // Verify user can access this stream
    if (request.user?.id !== userId) {
      reply.status(403).send({ error: 'Forbidden' });
      return;
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Store connection
    connections.set(connectionId, reply);
    
    logger.info({ userId, connectionId }, 'SSE connection established');

    // Send initial connection confirmation
    reply.raw.write(`data: ${JSON.stringify({ 
      type: 'connected', 
      connectionId,
      timestamp: new Date().toISOString() 
    })}\n\n`);

    // Set up heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(`data: ${JSON.stringify({ 
          type: 'heartbeat', 
          timestamp: new Date().toISOString() 
        })}\n\n`);
      } else {
        clearInterval(heartbeatInterval);
        connections.delete(connectionId);
      }
    }, config.sseHeartbeatInterval);

    // Handle client disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeatInterval);
      connections.delete(connectionId);
      logger.info({ userId, connectionId }, 'SSE connection closed');
    });

    // Handle server-side errors
    reply.raw.on('error', (error) => {
      clearInterval(heartbeatInterval);
      connections.delete(connectionId);
      logger.error({ userId, connectionId, error }, 'SSE connection error');
    });
  });

  // Endpoint to send data to specific user's stream
  fastify.post('/send/:userId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: { userId: z.string().uuid() },
      body: z.object({
        type: z.string(),
        data: z.any(),
        messageId: z.string().uuid().optional(),
      }),
    },
  }, async (request: FastifyRequest<{ 
    Params: { userId: string };
    Body: { type: string; data: any; messageId?: string; };
  }>, reply: FastifyReply) => {
    const { userId } = request.params;
    const { type, data, messageId } = request.body;

    // Find active connections for user
    const userConnections = Array.from(connections.entries())
      .filter(([id, _]) => id.startsWith(userId));

    if (userConnections.length === 0) {
      reply.status(404).send({ error: 'No active connections for user' });
      return;
    }

    const message = {
      type,
      data,
      messageId,
      timestamp: new Date().toISOString(),
    };

    // Send to all user connections
    let sentCount = 0;
    for (const [connectionId, connection] of userConnections) {
      try {
        if (!connection.raw.destroyed) {
          connection.raw.write(`data: ${JSON.stringify(message)}\n\n`);
          sentCount++;
        } else {
          connections.delete(connectionId);
        }
      } catch (error) {
        logger.error({ connectionId, error }, 'Error sending SSE message');
        connections.delete(connectionId);
      }
    }

    reply.send({ 
      sent: sentCount, 
      totalConnections: userConnections.length 
    });
  });

  // Get active connections count
  fastify.get('/connections', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const totalConnections = connections.size;
    const userConnections = Array.from(connections.keys())
      .reduce((acc, connectionId) => {
        const userId = connectionId.split('-')[0];
        acc[userId] = (acc[userId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    reply.send({
      total: totalConnections,
      byUser: userConnections,
      limit: config.sseMaxConnections,
    });
  });
}

// Utility function to send SSE message to user
export function sendSSEMessage(userId: string, type: string, data: any, messageId?: string) {
  const userConnections = Array.from(connections.entries())
    .filter(([id, _]) => id.startsWith(userId));

  const message = {
    type,
    data,
    messageId,
    timestamp: new Date().toISOString(),
  };

  for (const [connectionId, connection] of userConnections) {
    try {
      if (!connection.raw.destroyed) {
        connection.raw.write(`data: ${JSON.stringify(message)}\n\n`);
      } else {
        connections.delete(connectionId);
      }
    } catch (error) {
      logger.error({ connectionId, error }, 'Error sending SSE message');
      connections.delete(connectionId);
    }
  }

  return userConnections.length;
}
