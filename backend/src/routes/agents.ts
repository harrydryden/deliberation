import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const createAgentConfigSchema = z.object({
  agentType: z.string(),
  name: z.string(),
  systemPrompt: z.string(),
  description: z.string().optional(),
  goals: z.array(z.string()).optional(),
  responseStyle: z.string().optional(),
  isDefault: z.boolean().default(false),
});

const updateAgentConfigSchema = createAgentConfigSchema.partial();

const testAgentSchema = z.object({
  agentConfigId: z.string().uuid(),
  testMessage: z.string().min(1).max(500),
});

const addKnowledgeSchema = z.object({
  agentId: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  contentType: z.string().default('text/plain'),
  fileName: z.string().optional(),
});

export async function agentRoutes(fastify: FastifyInstance) {
  // Get all agent configurations
  fastify.get('/configurations', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const configurations = await fastify.prisma.agentConfiguration.findMany({
        where: { isActive: true },
        select: {
          id: true,
          agentType: true,
          name: true,
          description: true,
          isDefault: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [
          { isDefault: 'desc' },
          { agentType: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      reply.send({ configurations });
    } catch (error) {
      fastify.log.error({ error }, 'Error fetching agent configurations');
      reply.status(500).send({ error: 'Failed to fetch configurations' });
    }
  });

  // Get specific agent configuration
  fastify.get('/configurations/:configId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: z.object({
        configId: z.string().uuid(),
      }),
    },
  }, async (request: FastifyRequest<{ 
    Params: { configId: string } 
  }>, reply: FastifyReply) => {
    const { configId } = request.params;

    try {
      const configuration = await fastify.prisma.agentConfiguration.findUnique({
        where: { id: configId },
        include: {
          knowledge: {
            select: {
              id: true,
              title: true,
              contentType: true,
              fileName: true,
              createdAt: true,
            },
          },
        },
      });

      if (!configuration) {
        reply.status(404).send({ error: 'Configuration not found' });
        return;
      }

      reply.send({ configuration });
    } catch (error) {
      fastify.log.error({ error, configId }, 'Error fetching agent configuration');
      reply.status(500).send({ error: 'Failed to fetch configuration' });
    }
  });

  // Create new agent configuration (admin only)
  fastify.post('/configurations', {
    preHandler: [fastify.authenticate],
    schema: {
      body: createAgentConfigSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof createAgentConfigSchema> 
  }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const configData = request.body;

    try {
      // Check if user is admin (you'd implement this check based on your auth system)
      // For now, we'll allow any authenticated user

      // If setting as default, unset other defaults for this agent type
      if (configData.isDefault) {
        await fastify.prisma.agentConfiguration.updateMany({
          where: {
            agentType: configData.agentType,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      const configuration = await fastify.prisma.agentConfiguration.create({
        data: {
          ...configData,
          createdBy: userId,
          isActive: true,
        },
      });

      reply.status(201).send({ configuration });
    } catch (error) {
      fastify.log.error({ error, userId }, 'Error creating agent configuration');
      reply.status(500).send({ error: 'Failed to create configuration' });
    }
  });

  // Update agent configuration
  fastify.put('/configurations/:configId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: z.object({
        configId: z.string().uuid(),
      }),
      body: updateAgentConfigSchema,
    },
  }, async (request: FastifyRequest<{ 
    Params: { configId: string };
    Body: z.infer<typeof updateAgentConfigSchema>;
  }>, reply: FastifyReply) => {
    const { configId } = request.params;
    const updateData = request.body;

    try {
      // Check if configuration exists
      const existing = await fastify.prisma.agentConfiguration.findUnique({
        where: { id: configId },
      });

      if (!existing) {
        reply.status(404).send({ error: 'Configuration not found' });
        return;
      }

      // If setting as default, unset other defaults for this agent type
      if (updateData.isDefault && updateData.agentType) {
        await fastify.prisma.agentConfiguration.updateMany({
          where: {
            agentType: updateData.agentType,
            isDefault: true,
            id: { not: configId },
          },
          data: { isDefault: false },
        });
      }

      const configuration = await fastify.prisma.agentConfiguration.update({
        where: { id: configId },
        data: updateData,
      });

      reply.send({ configuration });
    } catch (error) {
      fastify.log.error({ error, configId }, 'Error updating agent configuration');
      reply.status(500).send({ error: 'Failed to update configuration' });
    }
  });

  // Test agent configuration
  fastify.post('/test', {
    preHandler: [fastify.authenticate, fastify.aiRateLimit],
    schema: {
      body: testAgentSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof testAgentSchema> 
  }>, reply: FastifyReply) => {
    const { agentConfigId, testMessage } = request.body;
    const userId = request.user.id;
    const traceId = request.id;

    try {
      const configuration = await fastify.prisma.agentConfiguration.findUnique({
        where: { id: agentConfigId },
      });

      if (!configuration) {
        reply.status(404).send({ error: 'Configuration not found' });
        return;
      }

      // Create a test context for the agent
      const testContext = {
        content: testMessage,
        userId,
        inputType: 'OTHER' as const,
        traceId,
      };

      // Import the appropriate agent service
      let response;
      if (configuration.agentType === 'bill_agent') {
        const { BillAgentService } = await import('../services/bill-agent.service');
        const billAgent = new BillAgentService(fastify.prisma);
        response = await billAgent.generateResponse(testContext);
      } else if (configuration.agentType === 'peer_agent') {
        const { PeerAgentService } = await import('../services/peer-agent.service');
        const peerAgent = new PeerAgentService(fastify.prisma);
        response = await peerAgent.generateResponse(testContext);
      } else {
        reply.status(400).send({ error: 'Unsupported agent type for testing' });
        return;
      }

      reply.send({
        testResult: {
          input: testMessage,
          output: response.content,
          processingTime: response.processingTime,
          configuration: {
            id: configuration.id,
            name: configuration.name,
            agentType: configuration.agentType,
          },
        },
      });
    } catch (error) {
      fastify.log.error({ error, agentConfigId, userId }, 'Error testing agent');
      reply.status(500).send({ error: 'Agent test failed' });
    }
  });

  // Add knowledge to agent
  fastify.post('/knowledge', {
    preHandler: [fastify.authenticate],
    schema: {
      body: addKnowledgeSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof addKnowledgeSchema> 
  }>, reply: FastifyReply) => {
    const { agentId, title, content, contentType, fileName } = request.body;
    const userId = request.user.id;

    try {
      // Verify agent configuration exists
      const agentConfig = await fastify.prisma.agentConfiguration.findUnique({
        where: { id: agentId },
      });

      if (!agentConfig) {
        reply.status(404).send({ error: 'Agent configuration not found' });
        return;
      }

      const knowledge = await fastify.prisma.agentKnowledge.create({
        data: {
          agentId,
          title,
          content,
          contentType,
          fileName,
          fileSize: content.length,
          createdBy: userId,
        },
      });

      reply.status(201).send({ knowledge });
    } catch (error) {
      fastify.log.error({ error, agentId, userId }, 'Error adding knowledge');
      reply.status(500).send({ error: 'Failed to add knowledge' });
    }
  });

  // Get agent knowledge
  fastify.get('/knowledge/:agentId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: z.object({
        agentId: z.string().uuid(),
      }),
    },
  }, async (request: FastifyRequest<{ 
    Params: { agentId: string } 
  }>, reply: FastifyReply) => {
    const { agentId } = request.params;

    try {
      const knowledge = await fastify.prisma.agentKnowledge.findMany({
        where: { agentId },
        select: {
          id: true,
          title: true,
          contentType: true,
          fileName: true,
          fileSize: true,
          chunkIndex: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      reply.send({ knowledge });
    } catch (error) {
      fastify.log.error({ error, agentId }, 'Error fetching agent knowledge');
      reply.status(500).send({ error: 'Failed to fetch knowledge' });
    }
  });

  // Delete knowledge item
  fastify.delete('/knowledge/:knowledgeId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: z.object({
        knowledgeId: z.string().uuid(),
      }),
    },
  }, async (request: FastifyRequest<{ 
    Params: { knowledgeId: string } 
  }>, reply: FastifyReply) => {
    const { knowledgeId } = request.params;

    try {
      const knowledge = await fastify.prisma.agentKnowledge.findUnique({
        where: { id: knowledgeId },
      });

      if (!knowledge) {
        reply.status(404).send({ error: 'Knowledge item not found' });
        return;
      }

      await fastify.prisma.agentKnowledge.delete({
        where: { id: knowledgeId },
      });

      reply.send({ message: 'Knowledge item deleted successfully' });
    } catch (error) {
      fastify.log.error({ error, knowledgeId }, 'Error deleting knowledge');
      reply.status(500).send({ error: 'Failed to delete knowledge' });
    }
  });
}