import { IMessageService } from '../interfaces';
import { IMessageRepository } from '@/repositories/interfaces';
import { Message } from '@/types/api';
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
    mode: 'chat' | 'learn' = 'chat'
  ): Promise<Message> {
    try {
      const messageData = {
        content: content.trim(),
        message_type: messageType as any,
        deliberation_id: deliberationId,
        // Note: user_id should be set by the calling context with current user
      } as any;

      const message = await this.messageRepository.create(messageData);
      
      logger.info('Message sent successfully', { 
        messageId: message.id, 
        type: messageType, 
        deliberationId 
      });
      
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