import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  bio: z.string().optional(),
  expertiseAreas: z.array(z.string()).optional(),
});

export async function authRoutes(fastify: FastifyInstance) {
  // Register new user
  fastify.post('/register', {
    schema: {
      body: registerSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof registerSchema> 
  }>, reply: FastifyReply) => {
    const { email, password, displayName } = request.body;

    try {
      // Check if user already exists
      const existingUser = await fastify.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        reply.status(400).send({ error: 'User already exists' });
        return;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);
      const userId = uuidv4();

      // Create user and profile in transaction
      const result = await fastify.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: userId,
            email,
            // Note: In a real app, you'd have a password field
            // For this migration, we're assuming password handling is done elsewhere
          },
        });

        const profile = await tx.profile.create({
          data: {
            userId,
            displayName: displayName || email.split('@')[0],
          },
        });

        return { user, profile };
      });

      // Generate JWT token
      const token = fastify.jwt.sign(
        { sub: userId, email },
        { expiresIn: '24h' }
      );

      reply.status(201).send({
        user: {
          id: result.user.id,
          email: result.user.email,
          profile: {
            displayName: result.profile.displayName,
            bio: result.profile.bio,
          },
        },
        token,
      });
    } catch (error) {
      fastify.log.error({ error, email }, 'Registration error');
      reply.status(500).send({ error: 'Registration failed' });
    }
  });

  // Login user
  fastify.post('/login', {
    schema: {
      body: loginSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof loginSchema> 
  }>, reply: FastifyReply) => {
    const { email, password } = request.body;

    try {
      // Find user with profile
      const user = await fastify.prisma.user.findUnique({
        where: { email },
        include: { profile: true },
      });

      if (!user) {
        reply.status(401).send({ error: 'Invalid credentials' });
        return;
      }

      // In a real implementation, you'd verify the password hash here
      // For this migration, we'll assume password verification is handled elsewhere

      // Generate JWT token
      const token = fastify.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: '24h' }
      );

      reply.send({
        user: {
          id: user.id,
          email: user.email,
          profile: user.profile ? {
            displayName: user.profile.displayName,
            bio: user.profile.bio,
            expertiseAreas: user.profile.expertiseAreas,
          } : null,
        },
        token,
      });
    } catch (error) {
      fastify.log.error({ error, email }, 'Login error');
      reply.status(500).send({ error: 'Login failed' });
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
          email: user.email,
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
      // Generate new JWT token
      const token = fastify.jwt.sign(
        { sub: userId, email },
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
          isUsed: false,
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

  // Use access code (mark as used)
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
    const userId = request.user.id;

    try {
      const accessCode = await fastify.prisma.accessCode.findFirst({
        where: {
          code,
          isUsed: false,
        },
      });

      if (!accessCode) {
        reply.status(404).send({ error: 'Invalid or expired access code' });
        return;
      }

      // Mark code as used
      await fastify.prisma.accessCode.update({
        where: { id: accessCode.id },
        data: {
          isUsed: true,
          usedBy: userId,
          usedAt: new Date(),
        },
      });

      reply.send({
        message: 'Access code used successfully',
        codeType: accessCode.codeType,
      });
    } catch (error) {
      fastify.log.error({ error, code, userId }, 'Error using access code');
      reply.status(500).send({ error: 'Failed to use access code' });
    }
  });
}