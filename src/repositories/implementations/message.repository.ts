import { supabase } from '@/integrations/supabase/client';
import { SupabaseBaseRepository } from './supabase-base.repository';
import { IMessageRepository } from '../interfaces';
import { Message } from '@/types/index';
import { logger } from '@/utils/logger';
import { userContextManager } from '@/utils/userContextManager';

export class MessageRepository extends SupabaseBaseRepository implements IMessageRepository {
  
  async findAll(filter?: Record<string, any>): Promise<Message[]> {
    try {
      let query = supabase
        .from('messages')
        .select('*');

      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        logger.error('Message repository findAll error', error as Error, { filter });
        throw error;
      }

      return data.map(item => this.mapToMessage(item));
    } catch (error) {
      logger.error('Message repository findAll failed', error as Error, { filter });
      throw error;
    }
  }

  async findById(id: string): Promise<Message | null> {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return this.mapToMessage(data);
    } catch (error) {
      logger.error('Message repository findById failed', error as Error, { id });
      throw error;
    }
  }

  async update(id: string, data: any): Promise<Message> {
    try {
      const { data: result, error } = await supabase
        .from('messages')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return this.mapToMessage(result);
    } catch (error) {
      logger.error('Message repository update failed', error as Error, { id, data });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    return this.deleteFromTable('messages', id);
  }

  private mapToMessage(data: any): Message {
    return {
      id: data.id,
      content: data.content,
      message_type: data.message_type,
      user_id: data.user_id,
      deliberation_id: data.deliberation_id,
      submitted_to_ibis: data.submitted_to_ibis || false,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  }

  async findByDeliberation(deliberationId: string): Promise<Message[]> {
    try {
      // Context set automatically via headers
      logger.info('Loading messages for deliberation', { deliberationId });

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Message repository findByDeliberation error', error as Error, { deliberationId });
        throw error;
      }

      return data.map(item => this.mapToMessage(item));
    } catch (error) {
      logger.error('Message repository findByDeliberation failed', error as Error, { deliberationId });
      throw error;
    }
  }

  async findByUser(userId: string): Promise<Message[]> {
    try {
      // Context set automatically via headers
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Message repository findByUser error', error as Error, { userId });
        throw error;
      }

      return data.map(item => this.mapToMessage(item));
    } catch (error) {
      logger.error('Message repository findByUser failed', error as Error, { userId });
      throw error;
    }
  }

  async create(data: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>, expectedUserId?: string): Promise<Message> {
    try {
      // CRITICAL: Input validation and sanitization
      if (!data.content || typeof data.content !== 'string') {
        throw new Error('Message content is required and must be a string');
      }

      if (!data.user_id) {
        throw new Error('User ID is required');
      }

      // CRITICAL: Additional user context validation if expectedUserId is provided
      if (expectedUserId && data.user_id !== expectedUserId) {
        logger.error('Repository: User ID mismatch detected', {
          providedUserId: data.user_id.substring(0, 8),
          expectedUserId: expectedUserId.substring(0, 8),
          deliberationId: data.deliberation_id?.substring(0, 8)
        });
        throw new Error('User ID validation failed: provided user ID does not match expected user ID');
      }

      // Validate user context before creating message
      if (data.deliberation_id) {
        try {
          await userContextManager.validateMessageCreation(data.user_id, data.deliberation_id);
        } catch (contextError) {
          logger.error('User context validation failed in repository', {
            error: contextError,
            userId: data.user_id.substring(0, 8),
            deliberationId: data.deliberation_id.substring(0, 8)
          });
          throw new Error(`User context validation failed: ${contextError instanceof Error ? contextError.message : String(contextError)}`);
        }
      }

      // Sanitize content for security
      const sanitizedContent = this.sanitizeMessageContent(data.content);
      if (sanitizedContent !== data.content) {
        logger.warn('Message content was sanitized', { 
          originalLength: data.content.length,
          sanitizedLength: sanitizedContent.length 
        });
      }

      // Validate message length
      if (sanitizedContent.length > 10000) {
        throw new Error('Message content exceeds maximum length of 10,000 characters');
      }

      if (sanitizedContent.trim().length === 0) {
        throw new Error('Message content cannot be empty after sanitization');
      }

      // Map the data to database column names with validation
      const dbData = {
        content: sanitizedContent,
        message_type: data.message_type || 'user',
        user_id: data.user_id,
        deliberation_id: data.deliberation_id || null,
        submitted_to_ibis: data.submitted_to_ibis || false
      };

      // Check for potential duplicates to prevent race conditions (within 2 seconds only)
      if (dbData.deliberation_id) {
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('id, content, created_at')
          .eq('user_id', dbData.user_id)
          .eq('deliberation_id', dbData.deliberation_id)
          .gte('created_at', new Date(Date.now() - 2000).toISOString()) // Reduced from 5s to 2s
          .order('created_at', { ascending: false })
          .limit(2); // Reduced from 3 to 2

        // CRITICAL FIX: Only check for duplicates of longer messages to avoid blocking short responses
        if (sanitizedContent.length > 10) {
          const exactDuplicate = recentMessages?.find(msg => 
            msg.content.trim() === sanitizedContent.trim()
          );

          if (exactDuplicate) {
            logger.warn('Duplicate message detected', { 
              messageId: exactDuplicate.id, 
              userId: dbData.user_id,
              deliberationId: dbData.deliberation_id,
              content: sanitizedContent.substring(0, 50),
              timeWindow: '2s'
            });
            throw new Error('Duplicate message detected - message not created');
          }
        } else {
          logger.debug('Skipping duplicate check for short message', { 
            contentLength: sanitizedContent.length,
            content: sanitizedContent
          });
        }
      }

      const { data: result, error } = await supabase
        .from('messages')
        .insert(dbData)
        .select()
        .single();

      if (error) {
        logger.error('Message repository create error', error as Error, { data: dbData });
        throw error;
      }

      logger.info('Message created successfully', { 
        messageId: result.id, 
        type: data.message_type,
        contentLength: sanitizedContent.length,
        deliberationId: data.deliberation_id 
      });
      
      return this.mapToMessage(result);
    } catch (error) {
      logger.error('Message repository create failed', error as Error, { data });
      throw error;
    }
  }

  /**
   * Sanitize message content to prevent XSS and other injection attacks
   */
  private sanitizeMessageContent(content: string): string {
    // Remove potential script tags and dangerous HTML
    let sanitized = content
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/<object[^>]*>.*?<\/object>/gi, '')
      .replace(/<embed[^>]*>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');

    // Remove excessive whitespace but preserve formatting
    sanitized = sanitized
      .replace(/\s{2,}/g, ' ')
      .trim();

    return sanitized;
  }
}