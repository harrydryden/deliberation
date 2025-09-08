import { IMessageService } from '../interfaces';
import { IMessageRepository } from '@/repositories/interfaces';
import { Message } from '@/types/index';
import { logger } from '@/utils/logger';

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
      if (!userId) {
        throw new Error('User ID is required to send a message');
      }

      // CRITICAL: Prevent race conditions with processing lock
      const { MessageProcessingLockManager } = await import('@/utils/messageProcessingLock');
      const contentHash = MessageProcessingLockManager.generateContentHash(content);

      return await MessageProcessingLockManager.executeWithLock(
        userId,
        deliberationId,
        'creating',
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
          } as any;

          const message = await this.messageRepository.create(messageData);
          
          logger.info('Message sent successfully', { 
            messageId: message.id, 
            type: messageType, 
            deliberationId,
            userId,
            contentLength: trimmedContent.length
          });

          // Agent orchestration is now handled via streaming in the frontend
          // Remove automatic orchestration to prevent duplicate responses
          
          return message;
        },
        contentHash
      );
    } catch (error) {
      logger.error('Message service sendMessage failed', { 
        error, 
        content: content?.slice(0, 50),
        messageType,
        deliberationId,
        userId 
      });
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