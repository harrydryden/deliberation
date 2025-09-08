import { useState, useCallback, useRef, useMemo } from 'react';
import { logger } from '@/utils/logger';

export interface QueuedMessage {
  id: string;
  content: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  queuePosition: number;
  parentMessageId?: string;
  timestamp: Date;
  retries: number;
  error?: string;
}

export interface MessageQueueState {
  queue: QueuedMessage[];
  processing: Set<string>;
  maxConcurrent: number;
  maxRetries: number;
}

export const useMessageQueue = (maxConcurrent: number = 3) => {
  const [queueState, setQueueState] = useState<MessageQueueState>({
    queue: [],
    processing: new Set(),
    maxConcurrent,
    maxRetries: 2
  });

  const processingTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const completionTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const removeFromQueue = useCallback((messageId: string) => {
    setQueueState(prev => ({
      ...prev,
      queue: prev.queue.filter(msg => msg.id !== messageId),
      processing: new Set([...prev.processing].filter(id => id !== messageId))
    }));

    // Clear any timeout for this message
    const timeout = processingTimeouts.current.get(messageId);
    if (timeout) {
      clearTimeout(timeout);
      processingTimeouts.current.delete(messageId);
    }

    // Clear any completion timeout for this message
    const completionTimeout = completionTimeouts.current.get(messageId);
    if (completionTimeout) {
      clearTimeout(completionTimeout);
      completionTimeouts.current.delete(messageId);
    }

    logger.info('🗑️ Message removed from queue', { messageId });
  }, []);

  const addToQueue = useCallback((content: string, parentMessageId?: string): string => {
    const messageId = `queue-${crypto.randomUUID()}`;
    const queuedMessage: QueuedMessage = {
      id: messageId,
      content: content.trim(),
      status: 'queued',
      queuePosition: queueState.queue.length,
      parentMessageId,
      timestamp: new Date(),
      retries: 0
    };

    setQueueState(prev => ({
      ...prev,
      queue: [...prev.queue, queuedMessage]
    }));

    logger.info('📋 Message added to queue', { 
      messageId, 
      queuePosition: queuedMessage.queuePosition,
      queueLength: queueState.queue.length + 1
    });

    return messageId;
  }, [queueState.queue.length]);

  const updateMessageStatus = useCallback((messageId: string, status: QueuedMessage['status'], error?: string) => {
    setQueueState(prev => {
      const message = prev.queue.find(msg => msg.id === messageId);
      if (!message) {
        // CRITICAL FIX: Don't warn for timeout handlers on already-removed messages
        if (error?.includes('timeout')) {
          logger.debug('Timeout fired for already-removed message (expected)', { messageId, status });
          return prev;
        }
        logger.warn('Message not found for status update', { messageId, status });
        return prev;
      }

      // Prevent invalid state transitions
      if ((message.status === 'completed' || message.status === 'failed') && status === 'processing') {
        logger.warn('Invalid state transition attempted', { messageId, from: message.status, to: status });
        return prev;
      }

      const updatedQueue = prev.queue.map(msg => 
        msg.id === messageId 
          ? { ...msg, status, error, retries: error ? msg.retries + 1 : msg.retries }
          : msg
      );

      const newProcessing = new Set(prev.processing);
      if (status === 'completed' || status === 'failed') {
        newProcessing.delete(messageId);
        // Clear any timeout for this message
        const timeout = processingTimeouts.current.get(messageId);
        if (timeout) {
          clearTimeout(timeout);
          processingTimeouts.current.delete(messageId);
        }
      } else if (status === 'processing') {
        newProcessing.add(messageId);
        // CRITICAL FIX: Create defensive timeout handler that checks message existence
        const timeout = setTimeout(() => {
          // Check if message still exists before timing out
          setQueueState(currentState => {
            const stillExists = currentState.queue.find(msg => msg.id === messageId);
            if (!stillExists) {
              logger.debug('Queue timeout: message already removed', { messageId });
              return currentState;
            }
            
            logger.warn('Queue processing timeout', { messageId, timeoutSeconds: 75 });
            // Use direct state update instead of recursive call
            const timeoutQueue = currentState.queue.map(msg => 
              msg.id === messageId 
                ? { ...msg, status: 'failed' as const, error: 'Queue processing timeout after 75 seconds', retries: msg.retries + 1 }
                : msg
            );
            
            const timeoutProcessing = new Set(currentState.processing);
            timeoutProcessing.delete(messageId);
            
            return {
              ...currentState,
              queue: timeoutQueue,
              processing: timeoutProcessing
            };
          });
        }, 75000);
        processingTimeouts.current.set(messageId, timeout);
      }

      return {
        ...prev,
        queue: updatedQueue,
        processing: newProcessing
      };
    });

    // Auto-remove completed messages after 5 seconds (increased from 3s to reduce race conditions)
    if (status === 'completed') {
      const completionTimeout = setTimeout(() => {
        removeFromQueue(messageId);
      }, 5000);
      completionTimeouts.current.set(messageId, completionTimeout);
    }

    logger.info('🔄 Queue message status updated', { messageId, status, error });
  }, [removeFromQueue]);

  const getNextQueuedMessage = useCallback((): QueuedMessage | null => {
    if (queueState.processing.size >= queueState.maxConcurrent) {
      return null; // Already at capacity
    }

    const nextMessage = queueState.queue.find(msg => 
      msg.status === 'queued' || 
      (msg.status === 'failed' && msg.retries < queueState.maxRetries)
    );

    return nextMessage || null;
  }, [queueState.queue, queueState.processing.size, queueState.maxConcurrent, queueState.maxRetries]);

  const retryMessage = useCallback((messageId: string) => {
    const message = queueState.queue.find(msg => msg.id === messageId);
    if (message && message.retries < queueState.maxRetries) {
      updateMessageStatus(messageId, 'queued');
      logger.info('🔄 Message retry initiated', { messageId, retries: message.retries });
    }
  }, [queueState.queue, queueState.maxRetries, updateMessageStatus]);

  const clearQueue = useCallback(() => {
    // Clear all timeouts
    processingTimeouts.current.forEach(timeout => clearTimeout(timeout));
    processingTimeouts.current.clear();
    completionTimeouts.current.forEach(timeout => clearTimeout(timeout));
    completionTimeouts.current.clear();

    setQueueState(prev => ({
      ...prev,
      queue: [],
      processing: new Set()
    }));

    logger.info('🧹 Message queue cleared');
  }, []);

  const getQueueStats = useMemo(() => {
    const { queue, processing } = queueState;
    return {
      total: queue.length,
      queued: queue.filter(msg => msg.status === 'queued').length,
      processing: processing.size,
      completed: queue.filter(msg => msg.status === 'completed').length,
      failed: queue.filter(msg => msg.status === 'failed').length,
      canProcess: processing.size < queueState.maxConcurrent
    };
  }, [queueState.queue.length, queueState.processing.size, queueState.maxConcurrent]);

  return {
    queue: queueState.queue,
    processing: queueState.processing,
    addToQueue,
    updateMessageStatus,
    getNextQueuedMessage,
    removeFromQueue,
    retryMessage,
    clearQueue,
    getQueueStats
  };
};