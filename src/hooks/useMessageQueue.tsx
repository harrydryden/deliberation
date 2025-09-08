import { useState, useCallback, useRef } from 'react';
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
        // Set a timeout to mark as failed if processing takes too long
        const timeout = setTimeout(() => {
          updateMessageStatus(messageId, 'failed', 'Processing timeout');
        }, 60000); // Increased to 60 second timeout to match streaming timeouts
        processingTimeouts.current.set(messageId, timeout);
      }

      return {
        ...prev,
        queue: updatedQueue,
        processing: newProcessing
      };
    });

    // Auto-remove completed messages after 3 seconds
    if (status === 'completed') {
      const completionTimeout = setTimeout(() => {
        removeFromQueue(messageId);
      }, 3000);
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

  const getQueueStats = useCallback(() => {
    const { queue, processing } = queueState;
    return {
      total: queue.length,
      queued: queue.filter(msg => msg.status === 'queued').length,
      processing: processing.size,
      completed: queue.filter(msg => msg.status === 'completed').length,
      failed: queue.filter(msg => msg.status === 'failed').length,
      canProcess: processing.size < queueState.maxConcurrent
    };
  }, [queueState]);

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