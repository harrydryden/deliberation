import { useCallback, useRef, useState } from 'react';
import { logger } from '@/utils/logger';

interface FailedMessage {
  messageId: string;
  content: string;
  deliberationId: string;
  timestamp: number;
  attemptCount: number;
  lastError: string;
}

interface StreamRecoveryConfig {
  maxRetryAttempts: number;
  retryDelayMs: number;
  failureWindowMs: number;
  maxFailedMessages: number;
}

const DEFAULT_CONFIG: StreamRecoveryConfig = {
  maxRetryAttempts: 3,
  retryDelayMs: 5000,
  failureWindowMs: 300000, // 5 minutes
  maxFailedMessages: 10,
};

export const useStreamRecovery = (config: Partial<StreamRecoveryConfig> = {}) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const [failedMessages, setFailedMessages] = useState<Map<string, FailedMessage>>(new Map());
  const recoveryTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const addFailedMessage = useCallback((
    messageId: string,
    content: string,
    deliberationId: string,
    error: string
  ) => {
    setFailedMessages(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(messageId);
      
      newMap.set(messageId, {
        messageId,
        content,
        deliberationId,
        timestamp: Date.now(),
        attemptCount: (existing?.attemptCount || 0) + 1,
        lastError: error,
      });
      
      // Clean up old failed messages
      const cutoff = Date.now() - finalConfig.failureWindowMs;
      for (const [id, message] of newMap.entries()) {
        if (message.timestamp < cutoff) {
          newMap.delete(id);
          // Clear any pending timeout
          const timeout = recoveryTimeoutRef.current.get(id);
          if (timeout) {
            clearTimeout(timeout);
            recoveryTimeoutRef.current.delete(id);
          }
        }
      }
      
      // Limit total failed messages
      if (newMap.size > finalConfig.maxFailedMessages) {
        const oldest = Array.from(newMap.values())
          .sort((a, b) => a.timestamp - b.timestamp)[0];
        newMap.delete(oldest.messageId);
        
        const timeout = recoveryTimeoutRef.current.get(oldest.messageId);
        if (timeout) {
          clearTimeout(timeout);
          recoveryTimeoutRef.current.delete(oldest.messageId);
        }
      }
      
      return newMap;
    });
    
    logger.warn('Message added to recovery queue', {
      messageId,
      error,
      deliberationId
    });
  }, [finalConfig.failureWindowMs, finalConfig.maxFailedMessages]);

  const removeFailedMessage = useCallback((messageId: string) => {
    setFailedMessages(prev => {
      const newMap = new Map(prev);
      newMap.delete(messageId);
      return newMap;
    });
    
    // Clear any pending timeout
    const timeout = recoveryTimeoutRef.current.get(messageId);
    if (timeout) {
      clearTimeout(timeout);
      recoveryTimeoutRef.current.delete(messageId);
    }
    
    logger.debug('Message removed from recovery queue', { messageId });
  }, []);

  const scheduleRecovery = useCallback((
    messageId: string,
    onRetry: (messageId: string, content: string, deliberationId: string) => void
  ) => {
    const failedMessage = failedMessages.get(messageId);
    if (!failedMessage || failedMessage.attemptCount >= finalConfig.maxRetryAttempts) {
      return false;
    }
    
    // Clear any existing timeout
    const existingTimeout = recoveryTimeoutRef.current.get(messageId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Calculate delay with exponential backoff
    const delay = finalConfig.retryDelayMs * Math.pow(2, failedMessage.attemptCount - 1);
    
    const timeoutId = setTimeout(() => {
      logger.info('Attempting automatic message recovery', {
        messageId,
        attemptCount: failedMessage.attemptCount,
        delay
      });
      
      onRetry(messageId, failedMessage.content, failedMessage.deliberationId);
      recoveryTimeoutRef.current.delete(messageId);
    }, delay);
    
    recoveryTimeoutRef.current.set(messageId, timeoutId);
    
    logger.debug('Recovery scheduled for message', {
      messageId,
      delay,
      attemptCount: failedMessage.attemptCount
    });
    
    return true;
  }, [failedMessages, finalConfig.maxRetryAttempts, finalConfig.retryDelayMs]);

  const getFailedMessageCount = useCallback(() => {
    return failedMessages.size;
  }, [failedMessages.size]);

  const getFailedMessages = useCallback(() => {
    return Array.from(failedMessages.values());
  }, [failedMessages]);

  const canRetry = useCallback((messageId: string) => {
    const failedMessage = failedMessages.get(messageId);
    return failedMessage && failedMessage.attemptCount < finalConfig.maxRetryAttempts;
  }, [failedMessages, finalConfig.maxRetryAttempts]);

  const clearAllFailures = useCallback(() => {
    // Clear all timeouts
    recoveryTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
    recoveryTimeoutRef.current.clear();
    
    setFailedMessages(new Map());
    
    logger.info('All failed messages cleared from recovery queue');
  }, []);

  const getRecoveryStats = useCallback(() => {
    const messages = Array.from(failedMessages.values());
    const now = Date.now();
    
    return {
      totalFailed: messages.length,
      recentFailures: messages.filter(m => now - m.timestamp < 60000).length, // Last minute
      averageAttempts: messages.length > 0 
        ? messages.reduce((sum, m) => sum + m.attemptCount, 0) / messages.length 
        : 0,
      oldestFailure: messages.length > 0 
        ? Math.min(...messages.map(m => m.timestamp)) 
        : null,
      pendingRetries: recoveryTimeoutRef.current.size,
    };
  }, [failedMessages]);

  return {
    addFailedMessage,
    removeFailedMessage,
    scheduleRecovery,
    getFailedMessageCount,
    getFailedMessages,
    canRetry,
    clearAllFailures,
    getRecoveryStats,
  };
};