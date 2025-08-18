import { supabase } from '@/integrations/supabase/client';
import { BaseRepository } from './base.repository';
import { IMessageRepository } from '../interfaces';
import { Message } from '@/types/api';
import { logger } from '@/utils/logger';

export class MessageRepository extends BaseRepository<Message> implements IMessageRepository {
  constructor() {
    super('messages');
  }

  async findByDeliberation(deliberationId: string): Promise<Message[]> {
    try {
      console.log('MessageRepository.findByDeliberation: Starting', { deliberationId });
      
      // Ensure user context is properly set for RLS policies
      const contextSet = await this.ensureUserContextWithRetry();
      console.log('MessageRepository.findByDeliberation: Context set result', { contextSet, deliberationId });
      
      if (!contextSet) {
        logger.warn('Could not set user context for RLS, may return empty results', { deliberationId });
      }
      
      // Debug: Check current user context
      const { data: debugData } = await supabase.rpc('debug_current_user_settings');
      console.log('MessageRepository.findByDeliberation: Current user context', { 
        debugData, 
        deliberationId,
        contextSet 
      });
      
      logger.info('Loading messages for deliberation', { deliberationId, contextSet });
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: true });

      console.log('MessageRepository.findByDeliberation: Query result', { 
        deliberationId,
        error: error?.message,
        dataCount: data?.length || 0,
        sampleData: data?.slice(0, 2)
      });

      if (error) {
        logger.error('Message repository findByDeliberation error', error, { deliberationId });
        throw error;
      }

      logger.info('Messages loaded successfully', { 
        deliberationId, 
        messageCount: data?.length || 0,
        contextSet
      });

      return data as Message[];
    } catch (error) {
      console.error('MessageRepository.findByDeliberation: Error', { error, deliberationId });
      logger.error('Message repository findByDeliberation failed', error, { deliberationId });
      throw error;
    }
  }

  // Single instance context manager to prevent race conditions
  private static contextPromise: Promise<boolean> | null = null;
  private static lastSetUserId: string | null = null;

  private async ensureUserContextWithRetry(userId?: string): Promise<boolean> {
    try {
      // Determine the user ID to use
      let targetUserId = userId;
      if (!targetUserId) {
        // Get current user from localStorage for debugging
        const storedUser = localStorage.getItem('simple_auth_user');
        const user = storedUser ? JSON.parse(storedUser) : null;
        targetUserId = user?.id;
      }
      
      console.log('ensureUserContextWithRetry: Starting', { userId: targetUserId });
      
      if (!targetUserId) {
        console.error('ensureUserContextWithRetry: No user ID available');
        return false;
      }

      // If we already have a context promise for this user, reuse it
      if (MessageRepository.contextPromise && MessageRepository.lastSetUserId === targetUserId) {
        try {
          return await MessageRepository.contextPromise;
        } catch (error) {
          // Clear failed promise and try again
          MessageRepository.contextPromise = null;
          MessageRepository.lastSetUserId = null;
        }
      }

      // Create new context setting promise
      MessageRepository.lastSetUserId = targetUserId;
      MessageRepository.contextPromise = this.performContextSetting(targetUserId);
      
      try {
        const result = await MessageRepository.contextPromise;
        
        // Clear the promise after successful completion
        setTimeout(() => {
          if (MessageRepository.lastSetUserId === targetUserId) {
            MessageRepository.contextPromise = null;
            MessageRepository.lastSetUserId = null;
          }
        }, 1000);
        
        return result;
      } catch (error) {
        logger.error('Context setting failed', error);
        MessageRepository.contextPromise = null;
        MessageRepository.lastSetUserId = null;
        return false;
      }
    } catch (error) {
      console.error('ensureUserContextWithRetry: Fatal error', { error });
      return false;
    }
  }

  private async performContextSetting(userId: string): Promise<boolean> {
    try {
      logger.info('Setting user context for RLS', { userId });
      
      // Try up to 3 times to set the context properly
      let attempts = 3;
      while (attempts > 0) {
        try {
          // Set the user context
          const { error: setError } = await supabase.rpc('set_config', {
            setting_name: 'app.current_user_id',
            new_value: userId,
            is_local: false
          });

          if (setError) {
            logger.error('Failed to set user context', setError);
            attempts--;
            if (attempts > 0) await new Promise(resolve => setTimeout(resolve, 100));
            continue;
          }

          // Small delay to ensure the setting takes effect
          await new Promise(resolve => setTimeout(resolve, 150));
          
          // Verify it was set correctly
          const { data: debugData, error: debugError } = await supabase.rpc('debug_current_user_settings');
          
          if (debugError) {
            logger.error('Failed to verify user context', debugError);
            attempts--;
            if (attempts > 0) await new Promise(resolve => setTimeout(resolve, 100));
            continue;
          }

          const isCorrect = debugData?.config_value === userId && !debugData?.config_is_null;
          
          if (isCorrect) {
            logger.info('User context successfully set and verified', { userId, attempts: 4 - attempts });
            return true;
          } else {
            logger.warn('User context verification failed', { 
              expected: userId, 
              actual: debugData?.config_value,
              isNull: debugData?.config_is_null,
              attempts
            });
            attempts--;
            if (attempts > 0) await new Promise(resolve => setTimeout(resolve, 100 * (4 - attempts)));
          }
        } catch (error) {
          logger.error('Error in context setting attempt', error);
          attempts--;
          if (attempts > 0) await new Promise(resolve => setTimeout(resolve, 100 * (4 - attempts)));
        }
      }
      
      logger.error('Failed to set user context after all attempts', { userId });
      return false;
    } catch (error) {
      logger.error('Error in performContextSetting', error);
      return false;
    }
  }

  async findByUser(userId: string): Promise<Message[]> {
    try {
      // Ensure user context is properly set for RLS policies
      const contextSet = await this.ensureUserContextWithRetry(userId);
      if (!contextSet) {
        logger.warn('Could not set user context for RLS, may return empty results', { userId });
      }
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Message repository findByUser error', error, { userId });
        throw error;
      }

      return data as Message[];
    } catch (error) {
      logger.error('Message repository findByUser failed', error, { userId });
      throw error;
    }
  }

  async create(data: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>): Promise<Message> {
    try {
      // Ensure user context is properly set for RLS policies
      const contextSet = await this.ensureUserContextWithRetry(data.userId);
      if (!contextSet) {
        throw new Error('Unable to authenticate your session. Please refresh the page and try again.');
      }
      
      // Map the data to database column names
      const dbData = {
        content: data.content,
        message_type: data.messageType,
        user_id: data.userId,
        deliberation_id: (data as any).deliberationId,
      };

      const { data: result, error } = await supabase
        .from('messages')
        .insert(dbData)
        .select()
        .single();

      if (error) {
        logger.error('Message repository create error', error, { data });
        throw error;
      }

      // Agent orchestration is handled at the service layer, not repository layer

      logger.info('Message created successfully', { messageId: result.id, type: data.messageType });
      
      // Map back to API format
      return {
        id: result.id,
        content: result.content,
        messageType: result.message_type,
        userId: result.user_id,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
      } as Message;
    } catch (error) {
      logger.error('Message repository create failed', error, { data });
      throw error;
    }
  }

}