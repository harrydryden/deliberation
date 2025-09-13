import { IMessageService } from '../interfaces';
import { IMessageRepository } from '@/repositories/interfaces';
import { Message } from '@/types/index';
import { logger } from '@/utils/logger';
import { userContextManager } from '@/utils/userContextManager';
import { MessageAuditLogger } from '@/utils/messageAuditLogger';

export class MessageService implements IMessageService {
  constructor(private messageRepository: IMessageRepository) {}

  async getMessages(deliberationId?: string): Promise<Message[]> {
    try {
      if (deliberationId) {
        return await this.messageRepository.findByDeliberation(deliberationId);
      }
      return await this.messageRepository.findAll();
    } catch (error) {
      logger.error('Message service getMessages failed', { error, deliberationId });
      throw error;
    }
  }

  async sendMessage(
    content: string, 
    messageType: string = 'user', 
    deliberationId?: string, 
    mode: 'chat' | 'learn' = 'chat',
    userId?: string
  ): Promise<Message> {
    try {
      // PHASE 1: Mode parameter logging in message service
      logger.info(' [PHASE1] Message service sendMessage called', {
        messageType,
        deliberationId: deliberationId?.substring(0, 8),
        mode,
        modeType: typeof mode,
        userId: userId?.substring(0, 8),
        contentLength: content?.length || 0,
        hasMode: mode !== undefined,
        isLearnMode: mode === 'learn'
      });

      if (!userId) {
        throw new Error('User ID is required to send a message');
      }

      // CRITICAL: Validate user context and session integrity
      const userContext = await userContextManager.validateMessageCreation(userId, deliberationId);
      
      // Audit log the creation attempt  
      const isValid = userContextManager.validateMessageCreation(userId, { content, mode });
      if (!isValid) {
        throw new Error('Message validation failed');
      }

      // Validate mode parameter
      if (mode && !['chat', 'learn'].includes(mode)) {
        logger.warn(' [PHASE1] Invalid mode in message service', {
          invalidMode: mode,
          defaultingTo: 'chat',
          userId: userId.substring(0, 8)
        });
      }

      // CRITICAL: Prevent race conditions with processing lock
      const { MessageProcessingLockManager } = await import('@/utils/messageProcessingLock');
      const contentHash = MessageProcessingLockManager.generateContentHash(content);

      return await MessageProcessingLockManager.executeWithLock(
        `user_${userId}`,
        async () => {
          // Validate and sanitize content
          if (!content || typeof content !== 'string') {
            throw new Error('Message content is required and must be a string');
          }

          const trimmedContent = content.trim();
          if (trimmedContent.length === 0) {
            throw new Error('Message content cannot be empty');
          }

          if (trimmedContent.length > 10000) {
            throw new Error('Message content exceeds maximum length of 10,000 characters');
          }

          const messageData = {
            content: trimmedContent,
            message_type: messageType as any,
            user_id: userId,
            deliberation_id: deliberationId,
            processing_mode: mode  // PHASE 1: Ensure mode is stored with message
          } as any;

          // PHASE 1: Log message data before creation
          logger.info('� [PHASE1] Creating message with mode', {
            messageType,
            deliberationId: deliberationId?.substring(0, 8),
            userId: userId.substring(0, 8),
            processingMode: messageData.processing_mode,
            hasProcessingMode: 'processing_mode' in messageData
          });

          const message = await this.messageRepository.create(messageData, userId);
          
          // PERSISTENCE VERIFICATION: Ensure message was actually saved
          if (!message || !message.id) {
            await MessageAuditLogger.logMessageCreationFailure(userId, 'Message creation failed - no ID returned', deliberationId);
            throw new Error('Message creation failed - no ID returned');
          }
          
          // Verify message exists by attempting to read it back
          try {
            const verificationMessage = await this.messageRepository.findById(message.id);
            if (!verificationMessage) {
              await MessageAuditLogger.logMessageCreationFailure(userId, `Message persistence verification failed - message ${message.id} not found`, deliberationId);
              throw new Error(`Message persistence verification failed - message ${message.id} not found`);
            }
            logger.info('Message persistence verified', { messageId: message.id });
          } catch (verificationError) {
            logger.error('Message persistence verification failed', { 
              messageId: message.id, 
              error: verificationError 
            });
            await MessageAuditLogger.logMessageCreationFailure(userId, `Message was created but verification failed: ${verificationError}`, deliberationId);
            throw new Error(`Message was created but verification failed: ${verificationError}`);
          }
          
          // Audit log successful creation
          await MessageAuditLogger.logMessageCreationSuccess(message.id, userId, deliberationId);
          
          logger.info('Message sent and verified successfully', { 
            messageId: message.id, 
            type: messageType, 
            deliberationId,
            userId,
            contentLength: trimmedContent.length
          });

          // Agent orchestration is now handled via streaming in the frontend
          // Remove automatic orchestration to prevent duplicate responses
          
          return message;
        }
      );
    } catch (error) {
      logger.error('Message service sendMessage failed', { 
        error, 
        content: content?.slice(0, 50),
        messageType,
        deliberationId,
        userId 
      });
      
      // Audit log the failure
      if (userId) {
        await MessageAuditLogger.logMessageCreationFailure(userId, error instanceof Error ? error.message : String(error), deliberationId);
      }
      
      throw error;
    }
  }

  async getUserMessages(userId: string): Promise<Message[]> {
    try {
      return await this.messageRepository.findByUser(userId);
    } catch (error) {
      logger.error('Message service getUserMessages failed', { error, userId });
      throw error;
    }
  }
}