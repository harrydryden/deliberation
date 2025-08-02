import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authRateLimiter, recordSuccess, recordFailure } from '../middleware/rateLimiter';
import { 
  recordAccessCodeAttempt, 
  isSuspiciousIP, 
  validateAccessCodeFormat 
} from '../middleware/accessCodeSecurity';

const authSchema = z.object({
  accessCode: z.string()
    .min(8, "Access code must be at least 8 characters")
    .max(15, "Access code must not exceed 15 characters")
    .regex(/^[A-Z0-9]+$/, "Access code must contain only uppercase letters and numbers"),
});

const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  bio: z.string().optional(),
  expertiseAreas: z.array(z.string()).optional(),
});

export async function authRoutes(fastify: FastifyInstance) {
  // Authenticate with 10-digit access code
  fastify.post('/auth', {
    preHandler: [authRateLimiter(fastify)],
    schema: {
      body: authSchema,
    },
  }, async (request: FastifyRequest<{ 
    Body: z.infer<typeof authSchema> 
  }>, reply: FastifyReply) => {
    const { accessCode } = request.body;
    const clientIP = request.ip || request.socket.remoteAddress || 'unknown';
    const rateLimitKey = (request as any).rateLimitKey;

    try {
      // Validate access code format
      const formatValidation = validateAccessCodeFormat(accessCode);
      if (!formatValidation.valid) {
        recordAccessCodeAttempt(accessCode, clientIP);
        recordFailure(rateLimitKey);
        reply.status(400).send({ error: formatValidation.reason });
        return;
      }

      // Check for suspicious IP
      if (isSuspiciousIP(clientIP)) {
        fastify.log.warn({ ip: clientIP, accessCode }, 'Suspicious IP attempting authentication');
        recordFailure(rateLimitKey);
        reply.status(429).send({ 
          error: 'Too many invalid attempts. Please try again later.' 
        });
        return;
      }

      // Record the attempt for security monitoring
      recordAccessCodeAttempt(accessCode, clientIP);
      // Check if access code is valid using enhanced validation
      const validationResult = await fastify.prisma.$queryRaw<Array<{
        valid: boolean;
        code_type: string;
        expired: boolean;
        max_uses_reached: boolean;
      }>>`SELECT * FROM validate_access_code(${accessCode})`;

      const validation = validationResult[0];
      
      if (!validation || !validation.valid) {
        recordFailure(rateLimitKey);
        let errorMessage = 'Invalid access code';
        
        if (validation?.expired) {
          errorMessage = 'Access code has expired';
        } else if (validation?.max_uses_reached) {
          errorMessage = 'Access code usage limit reached';
        }
        
        reply.status(401).send({ error: errorMessage });
        return;
      }

      // Get the actual access code record for further processing
      const codeRecord = await fastify.prisma.accessCode.findFirst({
        where: {
          code: accessCode,
          isActive: true,
        },
      });

      if (!codeRecord) {
        recordFailure(rateLimitKey);
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

      // Increment access code usage
      await fastify.prisma.$queryRaw`SELECT increment_access_code_usage(${accessCode})`;

      // Generate JWT token with shorter expiration for security
      const token = fastify.jwt.sign(
        { sub: userId, accessCode },
        { expiresIn: '8h' } // Reduced from 24h for better security
      );

      // Record successful authentication
      recordSuccess(rateLimitKey);

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
      recordFailure(rateLimitKey);
      fastify.log.error({ error, accessCode, ip: clientIP }, 'Authentication error');
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
      // Use the enhanced validation function
      const validationResult = await fastify.prisma.$queryRaw<Array<{
        valid: boolean;
        code_type: string;
        expired: boolean;
        max_uses_reached: boolean;
      }>>`SELECT * FROM validate_access_code(${code})`;

      const validation = validationResult[0];

      if (!validation || !validation.valid) {
        let errorMessage = 'Invalid or expired access code';
        
        if (validation?.expired) {
          errorMessage = 'Access code has expired';
        } else if (validation?.max_uses_reached) {
          errorMessage = 'Access code usage limit reached';
        }
        
        reply.status(404).send({ error: errorMessage });
        return;
      }

      reply.send({
        valid: true,
        codeType: validation.code_type,
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
      // Use the enhanced validation function
      const validationResult = await fastify.prisma.$queryRaw<Array<{
        valid: boolean;
        code_type: string;
        expired: boolean;
        max_uses_reached: boolean;
      }>>`SELECT * FROM validate_access_code(${code})`;

      const validation = validationResult[0];

      if (!validation || !validation.valid) {
        reply.status(404).send({ error: 'Invalid access code' });
        return;
      }

      reply.send({
        message: 'Access code verified successfully',
        codeType: validation.code_type,
      });
    } catch (error) {
      fastify.log.error({ error, code }, 'Error verifying access code');
      reply.status(500).send({ error: 'Failed to verify access code' });
    }
  });
}