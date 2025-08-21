import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const authSchema = z.object({ accessCode: z.string() }); // deprecated

const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  bio: z.string().optional(),
  expertiseAreas: z.array(z.string()).optional(),
});

export async function authRoutes(fastify: FastifyInstance) {
  // Deprecated access-code authentication endpoint
  fastify.post('/auth', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.status(410).send({ error: 'Access-code authentication has been removed. Use Supabase Auth.' });
  });

  // Get current user profile
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;

    try {
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });

      if (!user) {
        reply.status(404).send({ error: 'User not found' });
        return;
      }

      reply.send({
        user: {
          id: user.id,
          accessCode: user.accessCode,
          profile: user.profile ? {
            displayName: user.profile.displayName,
            avatarUrl: user.profile.avatarUrl,
            bio: user.profile.bio,
            expertiseAreas: user.profile.expertiseAreas,
          } : null,
        },
      });
    } catch (error) {
      fastify.log.error({ error, userId }, 'Error fetching user profile');
      reply.status(500).send({ error: 'Failed to fetch profile' });
    }
  });

  // Update user profile
  fastify.put('/profile', {
    preHandler: [fastify.authenticate],
    schema: {
      body: updateProfileSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof updateProfileSchema> 
  }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const { displayName, bio, expertiseAreas } = request.body;

    try {
      const profile = await fastify.prisma.profile.upsert({
        where: { userId },
        update: {
          ...(displayName !== undefined && { displayName }),
          ...(bio !== undefined && { bio }),
          ...(expertiseAreas !== undefined && { expertiseAreas }),
        },
        create: {
          userId,
          displayName: displayName || '',
          bio,
          expertiseAreas: expertiseAreas || [],
        },
      });

      reply.send({
        profile: {
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          bio: profile.bio,
          expertiseAreas: profile.expertiseAreas,
        },
      });
    } catch (error) {
      fastify.log.error({ error, userId }, 'Error updating profile');
      reply.status(500).send({ error: 'Failed to update profile' });
    }
  });

  // Refresh token
  fastify.post('/refresh', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const email = request.user.email;

    try {
      // Get user to include accessCode in token
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
      });

      // Generate new JWT token with shorter expiration
      const token = fastify.jwt.sign(
        { sub: userId, accessCode: user?.accessCode },
        { expiresIn: '8h' } // Consistent with auth endpoint
      );

      reply.send({ token });
    } catch (error) {
      fastify.log.error({ error, userId }, 'Token refresh error');
      reply.status(500).send({ error: 'Failed to refresh token' });
    }
  });

  // Logout (client-side token invalidation)
  fastify.post('/logout', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // In a stateless JWT system, logout is handled client-side
    // In a production system, you might want to maintain a blacklist
    reply.send({ message: 'Logged out successfully' });
  });

  fastify.post('/check-access-code', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.status(410).send({ error: 'Access codes are no longer supported. Use Supabase Auth.' });
  });

  fastify.post('/use-access-code', { preHandler: [fastify.authenticate] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.status(410).send({ error: 'Access codes are no longer supported. Use Supabase Auth.' });
  });
}