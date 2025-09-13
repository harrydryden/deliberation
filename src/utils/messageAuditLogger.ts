import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export interface MessageAuditEvent {
  event_type: 'message_creation_attempt' | 'message_creation_success' | 'message_creation_failure' | 'user_mismatch_detected';
  message_id?: string;
  user_id: string;
  session_user_id?: string;
  deliberation_id?: string;
  content_length?: number;
  error_details?: string;
  metadata?: Record<string, any>;
}

/**
 * Audit logger for message operations to track user attribution issues
 */
export class MessageAuditLogger {
  private static async logToDatabase(event: MessageAuditEvent): Promise<void> {
    try {
      const { error } = await supabase
        .from('audit_logs')
        .insert({
          action: event.event_type,
          table_name: 'messages',
          record_id: event.message_id || null,
          user_id: event.user_id,
          new_values: {
            event_type: event.event_type,
            session_user_id: event.session_user_id,
            deliberation_id: event.deliberation_id,
            content_length: event.content_length,
            error_details: event.error_details,
            metadata: event.metadata
          }
        });
      
      if (error) {
        logger.error('Failed to log audit event to database', { error, event });
      }
    } catch (error) {
      logger.error('Audit logging failed', { error, event });
    }
  }
  
  static async logMessageCreationAttempt(userId: string, sessionUserId: string, deliberationId?: string, contentLength?: number): Promise<void> {
    const event: MessageAuditEvent = {
      event_type: 'message_creation_attempt',
      user_id: userId,
      session_user_id: sessionUserId,
      deliberation_id: deliberationId,
      content_length: contentLength,
      metadata: {
        timestamp: new Date().toISOString(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      }
    };
    
    logger.info(' Message creation attempt', {
      userId: userId.substring(0, 8),
      sessionUserId: sessionUserId.substring(0, 8),
      deliberationId: deliberationId?.substring(0, 8),
      contentLength,
      userMatch: userId === sessionUserId
    });
    
    await this.logToDatabase(event);
  }
  
  static async logMessageCreationSuccess(messageId: string, userId: string, deliberationId?: string): Promise<void> {
    const event: MessageAuditEvent = {
      event_type: 'message_creation_success',
      message_id: messageId,
      user_id: userId,
      deliberation_id: deliberationId,
      metadata: {
        timestamp: new Date().toISOString()
      }
    };
    
    logger.info(' Message creation successful', {
      messageId: messageId.substring(0, 8),
      userId: userId.substring(0, 8),
      deliberationId: deliberationId?.substring(0, 8)
    });
    
    await this.logToDatabase(event);
  }
  
  static async logMessageCreationFailure(userId: string, error: string, deliberationId?: string): Promise<void> {
    const event: MessageAuditEvent = {
      event_type: 'message_creation_failure',
      user_id: userId,
      deliberation_id: deliberationId,
      error_details: error,
      metadata: {
        timestamp: new Date().toISOString()
      }
    };
    
    logger.error(' Message creation failed', {
      userId: userId.substring(0, 8),
      deliberationId: deliberationId?.substring(0, 8),
      error
    });
    
    await this.logToDatabase(event);
  }
  
  static async logUserMismatchDetected(providedUserId: string, sessionUserId: string, deliberationId?: string): Promise<void> {
    const event: MessageAuditEvent = {
      event_type: 'user_mismatch_detected',
      user_id: providedUserId,
      session_user_id: sessionUserId,
      deliberation_id: deliberationId,
      error_details: 'User ID mismatch between provided user ID and session user ID',
      metadata: {
        timestamp: new Date().toISOString(),
        severity: 'CRITICAL'
      }
    };
    
    logger.error(' CRITICAL: User mismatch detected', {
      providedUserId: providedUserId.substring(0, 8),
      sessionUserId: sessionUserId.substring(0, 8),
      deliberationId: deliberationId?.substring(0, 8),
      severity: 'CRITICAL'
    });
    
    await this.logToDatabase(event);
  }
}