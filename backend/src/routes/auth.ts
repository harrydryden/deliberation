import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const authSchema = z.object({
  accessCode: z.string().regex(/^\d{10}$/, "Access code must be exactly 10 digits"),
});

const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  bio: z.string().optional(),
  expertiseAreas: z.array(z.string()).optional(),
});

export async function authRoutes(fastify: FastifyInstance) {
  // Authenticate with 10-digit access code
  fastify.post('/auth', {
    schema: {
      body: authSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof authSchema> 
  }>, reply: FastifyReply) => {
    const { accessCode } = request.body;

    try {
      // Check if access code is valid (no longer checking isUsed since codes are reusable)
      const codeRecord = await fastify.prisma.accessCode.findFirst({
        where: {
          code: accessCode,
        },
      });

      if (!codeRecord) {
        reply.status(401).send({ error: 'Invalid access code' });
        return;
      }

      // Check if user already exists with this access code
      let user = await fastify.prisma.user.findFirst({
        where: { accessCode },
        include: { profile: true },
      });

      const userId = user?.id || uuidv4();

      if (!user) {
        // Create new user and profile
        const result = await fastify.prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              id: userId,
              email: `${accessCode}@temp.local`, // Temporary email for compatibility
              accessCode,
            },
          });

          const newProfile = await tx.profile.create({
            data: {
              userId,
              displayName: `User ${accessCode}`,
            },
          });

          return { user: newUser, profile: newProfile };
        });
        
        user = { ...result.user, profile: result.profile };
      }

      // Generate JWT token
      const token = fastify.jwt.sign(
        { sub: userId, accessCode },
        { expiresIn: '24h' }
      );

      reply.send({
        user: {
          id: user.id,
          accessCode: user.accessCode,
          profile: user.profile ? {
            displayName: user.profile.displayName,
            bio: user.profile.bio,
            expertiseAreas: user.profile.expertiseAreas,
          } : null,
        },
        token,
      });
    } catch (error) {
      fastify.log.error({ error, accessCode }, 'Authentication error');
      reply.status(500).send({ error: 'Authentication failed' });
    }
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

      // Generate new JWT token
      const token = fastify.jwt.sign(
        { sub: userId, accessCode: user?.accessCode },
        { expiresIn: '24h' }
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

  // Check access code (for invite-only features)
  fastify.post('/check-access-code', {
    schema: {
      body: z.object({
        code: z.string(),
      }),
    },
  }, async (request: FastifyRequest<{ 
    Body: { code: string } 
  }>, reply: FastifyReply) => {
    const { code } = request.body;

    try {
      const accessCode = await fastify.prisma.accessCode.findFirst({
        where: {
          code,
        },
      });

      if (!accessCode) {
        reply.status(404).send({ error: 'Invalid or expired access code' });
        return;
      }

      reply.send({
        valid: true,
        codeType: accessCode.codeType,
      });
    } catch (error) {
      fastify.log.error({ error, code }, 'Error checking access code');
      reply.status(500).send({ error: 'Failed to check access code' });
    }
  });

  // Check access code validity (codes are now reusable)
  fastify.post('/use-access-code', {
    preHandler: [fastify.authenticate],
    schema: {
      body: z.object({
        code: z.string(),
      }),
    },
  }, async (request: FastifyRequest<{ 
    Body: { code: string } 
  }>, reply: FastifyReply) => {
    const { code } = request.body;

    try {
      const accessCode = await fastify.prisma.accessCode.findFirst({
        where: {
          code,
        },
      });

      if (!accessCode) {
        reply.status(404).send({ error: 'Invalid access code' });
        return;
      }

      reply.send({
        message: 'Access code verified successfully',
        codeType: accessCode.codeType,
      });
    } catch (error) {
      fastify.log.error({ error, code }, 'Error verifying access code');
      reply.status(500).send({ error: 'Failed to verify access code' });
    }
  });
}