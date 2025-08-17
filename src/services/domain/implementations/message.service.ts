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
    mode: 'chat' | 'learn' = 'chat',
    userId?: string
  ): Promise<Message> {
    try {
      if (!userId) {
        throw new Error('User ID is required to send a message');
      }

      const messageData = {
        content: content.trim(),
        messageType: messageType as any,
        userId: userId,
        deliberationId: deliberationId,
      } as any;

      const message = await this.messageRepository.create(messageData);
      
      logger.info('Message sent successfully', { 
        messageId: message.id, 
        type: messageType, 
        deliberationId,
        userId 
      });

      // Trigger agent orchestration for user messages
      if (messageType === 'user' && deliberationId) {
        this.triggerAgentOrchestration(message.id, deliberationId, mode).catch(error => {
          logger.error('Agent orchestration failed', { error, messageId: message.id });
        });
      }
      
      return message;
    } catch (error) {
      logger.error('Message service sendMessage failed', { error, content: content.slice(0, 50) });
      throw error;
    }
  }

  private async triggerAgentOrchestration(messageId: string, deliberationId: string, mode: 'chat' | 'learn') {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      const { data, error } = await supabase.functions.invoke('agent-orchestration', {
        body: {
          messageId,
          deliberationId,
          mode
        }
      });

      if (error) {
        logger.error('Agent orchestration edge function error', { error, messageId, deliberationId });
      } else {
        logger.info('Agent orchestration triggered successfully', { messageId, deliberationId, response: data });
      }
    } catch (error) {
      logger.error('Failed to trigger agent orchestration', { error, messageId, deliberationId });
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