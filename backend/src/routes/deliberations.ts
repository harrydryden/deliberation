import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const createDeliberationSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  isPublic: z.boolean().default(false),
  maxParticipants: z.number().min(1).max(1000).default(50),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

const updateDeliberationSchema = createDeliberationSchema.partial();

const joinDeliberationSchema = z.object({
  deliberationId: z.string().uuid(),
  role: z.enum(['participant', 'observer']).default('participant'),
});

export async function deliberationRoutes(fastify: FastifyInstance) {
  // Get user's deliberations
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;

    try {
      const deliberations = await fastify.prisma.deliberation.findMany({
        where: {
          OR: [
            { facilitatorId: userId },
            { 
              participants: {
                some: { userId }
              }
            },
            { isPublic: true },
          ],
        },
        include: {
          participants: {
            select: {
              id: true,
              role: true,
              joinedAt: true,
              user: {
                select: {
                  id: true,
                  profile: {
                    select: {
                      displayName: true,
                    },
                  },
                },
              },
            },
          },
          _count: {
            select: {
              messages: true,
              participants: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      reply.send({ deliberations });
    } catch (error) {
      fastify.log.error({ error, userId }, 'Error fetching deliberations');
      reply.status(500).send({ error: 'Failed to fetch deliberations' });
    }
  });

  // Get specific deliberation
  fastify.get('/:deliberationId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: z.object({
        deliberationId: z.string().uuid(),
      }),
    },
  }, async (request: FastifyRequest<{ 
    Params: { deliberationId: string } 
  }>, reply: FastifyReply) => {
    const { deliberationId } = request.params;
    const userId = request.user.id;

    try {
      const deliberation = await fastify.prisma.deliberation.findUnique({
        where: { id: deliberationId },
        include: {
          participants: {
            include: {
              user: {
                include: { profile: true },
              },
            },
          },
          messages: {
            where: {
              OR: [
                { userId },
                { messageType: { not: 'user' } },
              ],
            },
            select: {
              id: true,
              content: true,
              messageType: true,
              agentContext: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
            take: 50,
          },
          ibisNodes: {
            select: {
              id: true,
              title: true,
              nodeType: true,
              positionX: true,
              positionY: true,
              createdAt: true,
            },
          },
        },
      });

      if (!deliberation) {
        reply.status(404).send({ error: 'Deliberation not found' });
        return;
      }

      // Check if user has access
      const hasAccess = deliberation.isPublic || 
                       deliberation.facilitatorId === userId ||
                       deliberation.participants.some(p => p.userId === userId);

      if (!hasAccess) {
        reply.status(403).send({ error: 'Access denied' });
        return;
      }

      reply.send({ deliberation });
    } catch (error) {
      fastify.log.error({ error, deliberationId, userId }, 'Error fetching deliberation');
      reply.status(500).send({ error: 'Failed to fetch deliberation' });
    }
  });

  // Create new deliberation
  fastify.post('/', {
    preHandler: [fastify.authenticate],
    schema: {
      body: createDeliberationSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof createDeliberationSchema> 
  }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const deliberationData = request.body;

    try {
      const deliberation = await fastify.prisma.$transaction(async (tx) => {
        // Create deliberation
        const newDeliberation = await tx.deliberation.create({
          data: {
            ...deliberationData,
            facilitatorId: userId,
            status: 'draft',
            startTime: deliberationData.startTime ? new Date(deliberationData.startTime) : undefined,
            endTime: deliberationData.endTime ? new Date(deliberationData.endTime) : undefined,
          },
        });

        // Add facilitator as participant
        await tx.participant.create({
          data: {
            userId,
            deliberationId: newDeliberation.id,
            role: 'facilitator',
          },
        });

        return newDeliberation;
      });

      reply.status(201).send({ deliberation });
    } catch (error) {
      fastify.log.error({ error, userId }, 'Error creating deliberation');
      reply.status(500).send({ error: 'Failed to create deliberation' });
    }
  });

  // Update deliberation
  fastify.put('/:deliberationId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: z.object({
        deliberationId: z.string().uuid(),
      }),
      body: updateDeliberationSchema,
    },
  }, async (request: FastifyRequest<{ 
    Params: { deliberationId: string };
    Body: z.infer<typeof updateDeliberationSchema>;
  }>, reply: FastifyReply) => {
    const { deliberationId } = request.params;
    const userId = request.user.id;
    const updateData = request.body;

    try {
      // Check if user is facilitator
      const deliberation = await fastify.prisma.deliberation.findUnique({
        where: { id: deliberationId },
      });

      if (!deliberation) {
        reply.status(404).send({ error: 'Deliberation not found' });
        return;
      }

      if (deliberation.facilitatorId !== userId) {
        reply.status(403).send({ error: 'Only facilitators can update deliberations' });
        return;
      }

      const updatedDeliberation = await fastify.prisma.deliberation.update({
        where: { id: deliberationId },
        data: {
          ...updateData,
          startTime: updateData.startTime ? new Date(updateData.startTime) : undefined,
          endTime: updateData.endTime ? new Date(updateData.endTime) : undefined,
        },
      });

      reply.send({ deliberation: updatedDeliberation });
    } catch (error) {
      fastify.log.error({ error, deliberationId, userId }, 'Error updating deliberation');
      reply.status(500).send({ error: 'Failed to update deliberation' });
    }
  });

  // Join deliberation
  fastify.post('/join', {
    preHandler: [fastify.authenticate],
    schema: {
      body: joinDeliberationSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof joinDeliberationSchema> 
  }>, reply: FastifyReply) => {
    const { deliberationId, role } = request.body;
    const userId = request.user.id;

    try {
      // Check if deliberation exists and is accessible
      const deliberation = await fastify.prisma.deliberation.findUnique({
        where: { id: deliberationId },
        include: {
          participants: true,
        },
      });

      if (!deliberation) {
        reply.status(404).send({ error: 'Deliberation not found' });
        return;
      }

      if (!deliberation.isPublic && deliberation.facilitatorId !== userId) {
        reply.status(403).send({ error: 'Deliberation is not public' });
        return;
      }

      // Check if already a participant
      const existingParticipant = deliberation.participants.find(p => p.userId === userId);
      if (existingParticipant) {
        reply.status(400).send({ error: 'Already a participant' });
        return;
      }

      // Check participant limit
      if (deliberation.participants.length >= deliberation.maxParticipants) {
        reply.status(400).send({ error: 'Deliberation is full' });
        return;
      }

      // Add participant
      const participant = await fastify.prisma.participant.create({
        data: {
          userId,
          deliberationId,
          role,
        },
        include: {
          user: {
            include: { profile: true },
          },
        },
      });

      // Notify other participants via WebSocket
      if (fastify.io) {
        fastify.io.to(`deliberation:${deliberationId}`).emit('participant_joined', {
          participant: {
            id: participant.id,
            role: participant.role,
            user: {
              id: participant.user.id,
              profile: participant.user.profile,
            },
          },
        });
      }

      reply.status(201).send({ participant });
    } catch (error) {
      fastify.log.error({ error, deliberationId, userId }, 'Error joining deliberation');
      reply.status(500).send({ error: 'Failed to join deliberation' });
    }
  });

  // Leave deliberation
  fastify.post('/:deliberationId/leave', {
    preHandler: [fastify.authenticate],
    schema: {
      params: z.object({
        deliberationId: z.string().uuid(),
      }),
    },
  }, async (request: FastifyRequest<{ 
    Params: { deliberationId: string } 
  }>, reply: FastifyReply) => {
    const { deliberationId } = request.params;
    const userId = request.user.id;

    try {
      const participant = await fastify.prisma.participant.findFirst({
        where: {
          userId,
          deliberationId,
        },
      });

      if (!participant) {
        reply.status(404).send({ error: 'Not a participant in this deliberation' });
        return;
      }

      // Check if user is facilitator
      if (participant.role === 'facilitator') {
        reply.status(400).send({ error: 'Facilitator cannot leave deliberation' });
        return;
      }

      await fastify.prisma.participant.delete({
        where: { id: participant.id },
      });

      // Notify other participants
      if (fastify.io) {
        fastify.io.to(`deliberation:${deliberationId}`).emit('participant_left', {
          userId,
        });
      }

      reply.send({ message: 'Successfully left deliberation' });
    } catch (error) {
      fastify.log.error({ error, deliberationId, userId }, 'Error leaving deliberation');
      reply.status(500).send({ error: 'Failed to leave deliberation' });
    }
  });

  // Get deliberation statistics
  fastify.get('/:deliberationId/stats', {
    preHandler: [fastify.authenticate],
    schema: {
      params: z.object({
        deliberationId: z.string().uuid(),
      }),
    },
  }, async (request: FastifyRequest<{ 
    Params: { deliberationId: string } 
  }>, reply: FastifyReply) => {
    const { deliberationId } = request.params;
    const userId = request.user.id;

    try {
      // Verify access to deliberation
      const hasAccess = await fastify.prisma.participant.findFirst({
        where: {
          userId,
          deliberationId,
        },
      });

      if (!hasAccess) {
        reply.status(403).send({ error: 'Access denied' });
        return;
      }

      // Get statistics
      const [messageStats, participantStats, ibisStats] = await Promise.all([
        fastify.prisma.message.groupBy({
          by: ['messageType'],
          where: { deliberationId },
          _count: true,
        }),
        fastify.prisma.participant.count({
          where: { deliberationId },
        }),
        fastify.prisma.ibisNode.groupBy({
          by: ['nodeType'],
          where: { deliberationId },
          _count: true,
        }),
      ]);

      reply.send({
        statistics: {
          messages: messageStats.reduce((acc, stat) => {
            acc[stat.messageType] = stat._count;
            return acc;
          }, {} as Record<string, number>),
          participants: participantStats,
          ibisNodes: ibisStats.reduce((acc, stat) => {
            acc[stat.nodeType] = stat._count;
            return acc;
          }, {} as Record<string, number>),
        },
      });
    } catch (error) {
      fastify.log.error({ error, deliberationId, userId }, 'Error fetching deliberation stats');
      reply.status(500).send({ error: 'Failed to fetch statistics' });
    }
  });
}