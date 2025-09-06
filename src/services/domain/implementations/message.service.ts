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

      const messageData = {
        content: content.trim(),
        message_type: messageType as any,
        user_id: userId,
        deliberation_id: deliberationId,
      } as any;

      const message = await this.messageRepository.create(messageData);
      
      logger.info('Message sent successfully', { 
        messageId: message.id, 
        type: messageType, 
        deliberationId,
        userId 
      });

      // Agent orchestration is now handled via streaming in the frontend
      // Remove automatic orchestration to prevent duplicate responses
      
      return message;
    } catch (error) {
      logger.error('Message service sendMessage failed', { error, content: content.slice(0, 50) });
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