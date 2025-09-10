import { useEffect, useCallback, useRef } from 'react';
import { useMessageQueue } from './useMessageQueue';
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/use-toast';

interface RecoveryConfig {
  stuckMessageTimeoutMs: number;
  recoveryCheckIntervalMs: number;
  maxFailuresBeforeAlert: number;
}

const DEFAULT_CONFIG: RecoveryConfig = {
  stuckMessageTimeoutMs: 60000, // 1 minute for stuck messages
  recoveryCheckIntervalMs: 10000, // Check every 10 seconds
  maxFailuresBeforeAlert: 3
};

/**
 * Hook for automatic message queue recovery and health monitoring
 */
export const useMessageQueueRecovery = (
  messageQueue: ReturnType<typeof useMessageQueue>,
  config: Partial<RecoveryConfig> = {}
) => {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const { toast } = useToast();
  const recoveryAttempts = useRef<Map<string, number>>(new Map());
  const lastHealthCheck = useRef<Date>(new Date());

  const recoverStuckMessages = useCallback(() => {
    const now = Date.now();
    const stats = messageQueue.getQueueStats;
    
    if (stats.processing === 0) {
      return; // No messages processing, nothing to recover
    }

    // Find messages that have been processing for too long
    const stuckMessages = messageQueue.queue.filter(message => {
      if (message.status !== 'processing') return false;
      
      const processingTime = now - new Date(message.timestamp).getTime();
      return processingTime > fullConfig.stuckMessageTimeoutMs;
    });

    if (stuckMessages.length > 0) {
      logger.warn('Found stuck messages, attempting recovery', {
        stuckCount: stuckMessages.length,
        messageIds: stuckMessages.map(m => m.id.substring(0, 8))
      });

      // Attempt to recover stuck messages
      stuckMessages.forEach(message => {
        const attempts = recoveryAttempts.current.get(message.id) || 0;
        
        if (attempts < fullConfig.maxFailuresBeforeAlert) {
          // Mark as failed and let the normal retry mechanism handle it
          messageQueue.updateMessageStatus(
            message.id, 
            'failed', 
            `Recovery attempt ${attempts + 1}: Message was stuck in processing state`
          );
          
          recoveryAttempts.current.set(message.id, attempts + 1);
          
          logger.info('Recovered stuck message', {
            messageId: message.id.substring(0, 8),
            attempts: attempts + 1
          });
        } else {
          // Remove message after too many recovery attempts
          messageQueue.removeFromQueue(message.id);
          recoveryAttempts.current.delete(message.id);
          
          logger.error('Removed message after max recovery attempts', {
            messageId: message.id.substring(0, 8),
            maxAttempts: fullConfig.maxFailuresBeforeAlert
          });

          toast({
            title: "Message Processing Failed",
            description: "A message failed to process after multiple attempts and was removed.",
            variant: "destructive"
          });
        }
      });
    }
  }, [messageQueue, fullConfig, toast]);

  const performHealthCheck = useCallback(() => {
    const stats = messageQueue.getQueueStats;
    const now = new Date();
    
    // Log health status for monitoring
    logger.debug('Queue health check', {
      stats,
      timestamp: now.toISOString()
    });

    // Check for concerning patterns
    if (stats.failed > 5) {
      logger.warn('High number of failed messages detected', {
        failedCount: stats.failed,
        totalMessages: stats.total
      });
    }

    if (stats.processing > 0 && stats.queued === 0) {
      const timeSinceLastCheck = now.getTime() - lastHealthCheck.current.getTime();
      if (timeSinceLastCheck > 30000) { // Processing for 30+ seconds with no queue
        logger.warn('Messages processing for extended time', {
          processingCount: stats.processing,
          timeSinceLastCheck: timeSinceLastCheck / 1000
        });
      }
    }

    lastHealthCheck.current = now;
  }, [messageQueue]);

  const getRecoveryStats = useCallback(() => {
    const stats = messageQueue.getQueueStats;
    return {
      ...stats,
      recoveryAttempts: Array.from(recoveryAttempts.current.entries()).map(([id, attempts]) => ({
        messageId: id.substring(0, 8),
        attempts
      })),
      lastHealthCheck: lastHealthCheck.current.toISOString(),
      isHealthy: stats.failed < 3 && stats.processing < 5
    };
  }, [messageQueue]);

  // Automatic recovery and health monitoring
  useEffect(() => {
    const recoveryInterval = setInterval(() => {
      recoverStuckMessages();
      performHealthCheck();
    }, fullConfig.recoveryCheckIntervalMs);

    return () => clearInterval(recoveryInterval);
  }, [recoverStuckMessages, performHealthCheck, fullConfig.recoveryCheckIntervalMs]);

  // Cleanup recovery attempts when messages are completed/removed
  useEffect(() => {
    const currentMessageIds = new Set(messageQueue.queue.map(m => m.id));
    
    // Clean up recovery attempts for messages no longer in queue
    for (const [messageId] of recoveryAttempts.current) {
      if (!currentMessageIds.has(messageId)) {
        recoveryAttempts.current.delete(messageId);
      }
    }
  }, [messageQueue.queue.length]);

  return {
    recoverStuckMessages,
    performHealthCheck,
    getRecoveryStats
  };
};