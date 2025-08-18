import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  inputType: z.enum(['QUESTION', 'STATEMENT', 'OTHER']).optional(),
  deliberationId: z.string().uuid().optional(),
});

const getMessagesSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  deliberationId: z.string().uuid().optional(),
});

const submitToIbisSchema = z.object({
  messageId: z.string().uuid(),
  nodeType: z.enum(['issue', 'position', 'argument']).default('position'),
  title: z.string().optional(),
});

export async function messageRoutes(fastify: FastifyInstance) {
  // Note: AIOrchestrationService is now deprecated in favor of direct streaming

  // Get user's messages
  fastify.get('/', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: getMessagesSchema,
    },
  }, async (request: FastifyRequest<{ 
    Querystring: z.infer<typeof getMessagesSchema> 
  }>, reply: FastifyReply) => {
    const { limit, offset, deliberationId } = request.query;
    const userId = request.user.id;

    try {
      const messages = await fastify.prisma.message.findMany({
        where: {
          userId,
          ...(deliberationId && { deliberationId }),
        },
        select: {
          id: true,
          content: true,
          messageType: true,
          agentContext: true,
          submittedToIbis: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      });

      const totalCount = await fastify.prisma.message.count({
        where: {
          userId,
          ...(deliberationId && { deliberationId }),
        },
      });

      reply.send({
        messages,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
      });
    } catch (error) {
      fastify.log.error({ error, userId }, 'Error fetching messages');
      reply.status(500).send({ error: 'Failed to fetch messages' });
    }
  });

  // Send a new message
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.aiRateLimit],
    schema: {
      body: sendMessageSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof sendMessageSchema> 
  }>, reply: FastifyReply) => {
    const { content, inputType, deliberationId } = request.body;
    const userId = request.user.id;
    const traceId = request.id;

    try {
      // Create user message
      const userMessage = await fastify.prisma.message.create({
        data: {
          id: uuidv4(),
          content: content.trim(),
          messageType: 'user',
          userId,
          deliberationId,
        },
        select: {
          id: true,
          content: true,
          messageType: true,
          createdAt: true,
        },
      });

      // Get or initialize session state
      const sessionState = await getSessionState(userId);

      // Note: Agent processing is now handled by frontend streaming hook
      // calling agent-orchestration-stream edge function directly
      // This avoids duplicate processing and provides real-time responses

      // Return user message immediately
      reply.status(201).send({
        message: userMessage,
        processing: true,
      });
    } catch (error) {
      fastify.log.error({ error, userId }, 'Error creating message');
      reply.status(500).send({ error: 'Failed to create message' });
    }
  });

  // Submit message to IBIS
  fastify.post('/submit-to-ibis', {
    preHandler: [fastify.authenticate],
    schema: {
      body: submitToIbisSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof submitToIbisSchema> 
  }>, reply: FastifyReply) => {
    const { messageId, nodeType, title } = request.body;
    const userId = request.user.id;

    try {
      // Verify message belongs to user
      const message = await fastify.prisma.message.findFirst({
        where: {
          id: messageId,
          userId,
          messageType: 'user',
        },
      });

      if (!message) {
        reply.status(404).send({ error: 'Message not found' });
        return;
      }

      if (message.submittedToIbis) {
        reply.status(400).send({ error: 'Message already submitted to IBIS' });
        return;
      }

      // Create IBIS node
      const ibisNode = await fastify.prisma.ibisNode.create({
        data: {
          title: title || message.content.substring(0, 100),
          description: message.content,
          nodeType,
          messageId,
          createdBy: userId,
        },
      });

      // Mark message as submitted
      await fastify.prisma.message.update({
        where: { id: messageId },
        data: { submittedToIbis: true },
      });

      reply.send({
        ibisNode: {
          id: ibisNode.id,
          title: ibisNode.title,
          nodeType: ibisNode.nodeType,
          createdAt: ibisNode.createdAt,
        },
        message: 'Successfully submitted to IBIS',
      });
    } catch (error) {
      fastify.log.error({ error, userId, messageId }, 'Error submitting to IBIS');
      reply.status(500).send({ error: 'Failed to submit to IBIS' });
    }
  });

  // Get message by ID
  fastify.get('/:messageId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: z.object({
        messageId: z.string().uuid(),
      }),
    },
  }, async (request: FastifyRequest<{ 
    Params: { messageId: string } 
  }>, reply: FastifyReply) => {
    const { messageId } = request.params;
    const userId = request.user.id;

    try {
      const message = await fastify.prisma.message.findFirst({
        where: {
          id: messageId,
          userId,
        },
        select: {
          id: true,
          content: true,
          messageType: true,
          agentContext: true,
          submittedToIbis: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!message) {
        reply.status(404).send({ error: 'Message not found' });
        return;
      }

      reply.send({ message });
    } catch (error) {
      fastify.log.error({ error, userId, messageId }, 'Error fetching message');
      reply.status(500).send({ error: 'Failed to fetch message' });
    }
  });

  // Helper method to get session state
  async function getSessionState(userId: string) {
    const recentMessages = await fastify.prisma.message.findMany({
      where: { userId, messageType: 'user' },
      select: { content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const statementCount = recentMessages.filter(m => 
      m.content.length > 20 && !m.content.endsWith('?')
    ).length;

    const questionCount = recentMessages.filter(m => 
      m.content.endsWith('?')
    ).length;

    return {
      lastActivityTime: Date.now(),
      messageCount: recentMessages.length,
      statementCount,
      questionCount,
      topicsEngaged: [],
      usedQuestionIds: [],
      proactivePromptsCount: 0,
      optedOutOfPrompts: false,
    };
  }
}