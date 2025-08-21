import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { createRedisClient } from '../utils/redis';

interface AuthenticatedSocket {
  id: string;
  userId: string;
  user: any;
  join: (room: string) => void;
  leave: (room: string) => void;
  emit: (event: string, data: any) => void;
  on: (event: string, handler: (data: any) => void) => void;
  disconnect: () => void;
}

export function setupWebSocket(io: SocketIOServer, prisma: PrismaClient) {
  const redis = createRedisClient();
  const PRESENCE_TTL_SECONDS = 45; // ephemeral presence TTL
  const PRESENCE_DEBOUNCE_MS = 15000; // minimum interval between DB writes per user
  const lastDbWrite: Map<string, number> = new Map();
  // Authentication middleware
  io.use(async (socket: any, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Try Supabase JWT first if configured
      let decoded: any;
      try {
        if (config.supabaseJwtSecret) {
          decoded = jwt.verify(token, config.supabaseJwtSecret);
        } else {
          decoded = jwt.verify(token, config.jwtSecret);
        }
      } catch (e) {
        // Fallback to project JWT if Supabase verify failed
        decoded = jwt.verify(token, config.jwtSecret);
      }
      
      // Fetch user from database
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub || decoded.id },
        include: { profile: true },
      });

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = user.id;
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Connection handling
  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info({ 
      socketId: socket.id, 
      userId: socket.userId 
    }, 'WebSocket connection established');

    // Join user's personal room for direct messages
    socket.join(`user:${socket.userId}`);

    // Handle joining deliberation rooms
    socket.on('join_deliberation', async (data: { deliberationId: string }) => {
      try {
        // Verify user is participant in deliberation
        const participant = await prisma.participant.findFirst({
          where: {
            userId: socket.userId,
            deliberationId: data.deliberationId,
          },
        });

        if (participant) {
          socket.join(`deliberation:${data.deliberationId}`);
          socket.emit('joined_deliberation', { deliberationId: data.deliberationId });
          
          // Broadcast user presence
          socket.to(`deliberation:${data.deliberationId}`).emit('user_joined', {
            userId: socket.userId,
            user: socket.user.profile,
          });

          logger.info({ 
            userId: socket.userId, 
            deliberationId: data.deliberationId 
          }, 'User joined deliberation room');
        } else {
          socket.emit('error', { message: 'Not authorized to join this deliberation' });
        }
      } catch (error) {
        logger.error({ error, userId: socket.userId }, 'Error joining deliberation');
        socket.emit('error', { message: 'Failed to join deliberation' });
      }
    });

    // Handle leaving deliberation rooms
    socket.on('leave_deliberation', (data: { deliberationId: string }) => {
      socket.leave(`deliberation:${data.deliberationId}`);
      socket.to(`deliberation:${data.deliberationId}`).emit('user_left', {
        userId: socket.userId,
      });
      socket.emit('left_deliberation', { deliberationId: data.deliberationId });
    });

    // Handle typing indicators
    socket.on('typing_start', (data: { deliberationId?: string }) => {
      const room = data.deliberationId ? `deliberation:${data.deliberationId}` : `user:${socket.userId}`;
      socket.to(room).emit('user_typing', {
        userId: socket.userId,
        isTyping: true,
      });
    });

    socket.on('typing_stop', (data: { deliberationId?: string }) => {
      const room = data.deliberationId ? `deliberation:${data.deliberationId}` : `user:${socket.userId}`;
      socket.to(room).emit('user_typing', {
        userId: socket.userId,
        isTyping: false,
      });
    });

    // Handle presence updates
    socket.on('presence_update', async (data: { status: 'online' | 'away' | 'busy' }) => {
      try {
        const key = `presence:user:${socket.userId}`;
        // Update ephemeral presence in Redis
        await redis.set(key, JSON.stringify({ status: data.status, ts: Date.now() }), 'EX', PRESENCE_TTL_SECONDS);

        // Debounced DB write for lastActive
        const now = Date.now();
        const last = lastDbWrite.get(socket.userId) || 0;
        if (now - last > PRESENCE_DEBOUNCE_MS) {
          lastDbWrite.set(socket.userId, now);
          prisma.user.update({ where: { id: socket.userId }, data: { updatedAt: new Date() } }).catch(() => {});
        }

        // Broadcast presence to all deliberations this socket has joined
        socket.rooms.forEach(room => {
          if (room.startsWith('deliberation:')) {
            socket.to(room).emit('presence_update', {
              userId: socket.userId,
              status: data.status,
              lastActive: new Date().toISOString(),
            });
          }
        });
      } catch (error) {
        logger.error({ error, userId: socket.userId }, 'Error updating presence');
      }
    });

    // Handle message reactions (for future use)
    socket.on('message_reaction', (data: { 
      messageId: string; 
      reaction: string; 
      deliberationId?: string; 
    }) => {
      const room = data.deliberationId ? `deliberation:${data.deliberationId}` : `user:${socket.userId}`;
      socket.to(room).emit('message_reaction', {
        messageId: data.messageId,
        reaction: data.reaction,
        userId: socket.userId,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info({ 
        socketId: socket.id, 
        userId: socket.userId,
        reason 
      }, 'WebSocket connection closed');

      // Broadcast user offline status to all deliberations
      socket.rooms.forEach(room => {
        if (room.startsWith('deliberation:')) {
          socket.to(room).emit('user_left', {
            userId: socket.userId,
          });
        }
      });
    });

    // Send initial connection confirmation
    socket.emit('connected', {
      socketId: socket.id,
      userId: socket.userId,
      timestamp: new Date().toISOString(),
    });
  });

  // Utility functions for broadcasting
  return {
    // Send message to specific user
    sendToUser: (userId: string, event: string, data: any) => {
      io.to(`user:${userId}`).emit(event, data);
    },

    // Send message to deliberation participants
    sendToDeliberation: (deliberationId: string, event: string, data: any) => {
      io.to(`deliberation:${deliberationId}`).emit(event, data);
    },

    // Get online users in deliberation
    getOnlineUsers: async (deliberationId: string) => {
      const sockets = await io.in(`deliberation:${deliberationId}`).fetchSockets();
      return sockets.map(socket => ({
        userId: (socket as any).userId,
        socketId: socket.id,
      }));
    },

    // Get total connection count
    getConnectionCount: () => io.engine.clientsCount,
  };
}