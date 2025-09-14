import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { messageProcessingCircuitBreaker, CircuitState } from '@/utils/circuitBreaker';

export interface QueuedMessage {
  id: string;
  content: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  queuePosition: number;
  parentMessageId?: string;
  timestamp: Date;
  retries: number;
  error?: string;
  mode: 'chat' | 'learn';
}

export interface MessageQueueState {
  queue: QueuedMessage[];
  processing: Set<string>;
  maxConcurrent: number;
  maxRetries: number;
  circuitBreakerOpen: boolean;
}

export const useMessageQueue = (maxConcurrent: number = 8) => {
  const [queueState, setQueueState] = useState<MessageQueueState>({
    queue: [],
    processing: new Set(),
    maxConcurrent,
    maxRetries: 2,
    circuitBreakerOpen: false,
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

    logger.info('� Message removed from queue', { messageId });
  }, []);

  const addToQueue = useCallback((content: string, parentMessageId?: string, mode: 'chat' | 'learn' = 'chat'): string => {
    // Check circuit breaker first
    const circuitState = messageProcessingCircuitBreaker.getState();
    if (circuitState === CircuitState.OPEN) {
      logger.warn('Circuit breaker open - message not queued', { content: content.substring(0, 50) });
      throw new Error('Message processing temporarily unavailable - please try again in a moment');
    }

    const messageId = `queue-${crypto.randomUUID()}`;
    const queuedMessage: QueuedMessage = {
      id: messageId,
      content: content.trim(),
      status: 'queued',
      queuePosition: 0, // Will be set by setQueueState
      parentMessageId,
      timestamp: new Date(),
      retries: 0,
      mode
    };

    setQueueState(prev => {
      const newQueue = [...prev.queue, { ...queuedMessage, queuePosition: prev.queue.length }];
      return {
        ...prev,
        queue: newQueue,
        circuitBreakerOpen: circuitState !== CircuitState.CLOSED,
      };
    });

    logger.info(' Message added to queue', { 
      messageId, 
      queuePosition: queuedMessage.queuePosition,
      mode,
      circuitState
    });

    return messageId;
  }, []); // Remove unstable dependency

  const updateMessageStatus = useCallback((messageId: string, status: QueuedMessage['status'], error?: string) => {
    setQueueState(prev => {
      const message = prev.queue.find(msg => msg.id === messageId);
      if (!message) {
        // Don't warn for timeout handlers on already-removed messages
        if (error?.includes('timeout')) {
          return prev;
        }
        logger.warn('Message not found in queue for status update', { messageId });
        return prev;
      }

      // Prevent invalid state transitions
      const isValidTransition = (from: QueuedMessage['status'], to: QueuedMessage['status']): boolean => {
        if (from === 'failed' && to === 'queued') return true;
        if (from === 'queued' && to === 'processing') return true;
        if (from === 'processing' && (to === 'completed' || to === 'failed')) return true;
        if ((from === 'completed' || from === 'failed') && to === 'processing') return false;
        if (from === to) return true;
        return true;
      };

      if (!isValidTransition(message.status, status)) {
        logger.warn('Invalid state transition blocked', { messageId, from: message.status, to: status });
        return prev;
      }

      // Enhanced status handling with exponential backoff for retries
      const updatedQueue = prev.queue.map(msg => {
        if (msg.id !== messageId) return msg;
        
        return {
          ...msg,
          status,
          error: status === 'failed' ? error : undefined,
          retries: status === 'failed' ? msg.retries + 1 : msg.retries,
          timestamp: status === 'failed' && msg.retries < 2 
            ? new Date(Date.now() + Math.pow(2, msg.retries + 1) * 1000) // Exponential backoff
            : msg.timestamp
        };
      }).filter(Boolean) as QueuedMessage[];

      const newProcessing = new Set(prev.processing);
      
      // Process state management
      if (status === 'completed' || status === 'failed') {
        newProcessing.delete(messageId);
        const timeout = processingTimeouts.current.get(messageId);
        if (timeout) {
          clearTimeout(timeout);
          processingTimeouts.current.delete(messageId);
        }
      } else if (status === 'processing') {
        if (!newProcessing.has(messageId)) {
          newProcessing.add(messageId);
          
          const timeout = setTimeout(() => {
            setQueueState(currentState => {
              const stillExists = currentState.queue.find(msg => msg.id === messageId);
              const stillProcessing = currentState.processing.has(messageId);
              
              if (!stillExists || !stillProcessing) {
                return currentState;
              }
              
              logger.warn('Message processing timeout', { messageId });
              
              const timeoutQueue = currentState.queue.map(msg => 
                msg.id === messageId 
                  ? { 
                      ...msg, 
                      status: 'failed' as const, 
                      error: 'Processing timeout after 8 seconds',
                      retries: msg.retries + 1 
                    }
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
          }, 8000);
          
          processingTimeouts.current.set(messageId, timeout);
        }
      }

      return {
        ...prev,
        queue: updatedQueue,
        processing: newProcessing
      };
    });

    // Auto-remove completed messages
    if (status === 'completed') {
      const completionTimeout = setTimeout(() => {
        removeFromQueue(messageId);
      }, 5000);
      completionTimeouts.current.set(messageId, completionTimeout);
    }
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
      logger.info(' Message retry initiated', { messageId, retries: message.retries });
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

  // SMART QUEUE CLEARING: Auto-clear failed messages that can't be retried
  const clearFailedMessages = useCallback(() => {
    setQueueState(prev => {
      const now = Date.now();
      const failedToRemove = prev.queue.filter(msg => 
        msg.status === 'failed' && 
        msg.retries >= prev.maxRetries &&
        (now - new Date(msg.timestamp).getTime()) > 30000 // Failed for 30+ seconds
      );

      if (failedToRemove.length > 0) {
        logger.info('🧹 Auto-clearing failed messages', { 
          count: failedToRemove.length,
          messageIds: failedToRemove.map(m => m.id) 
        });

        // Clear timeouts for removed messages
        failedToRemove.forEach(msg => {
          const timeout = processingTimeouts.current.get(msg.id);
          if (timeout) {
            clearTimeout(timeout);
            processingTimeouts.current.delete(msg.id);
          }
        });

        return {
          ...prev,
          queue: prev.queue.filter(msg => !failedToRemove.includes(msg))
        };
      }
      return prev;
    });
  }, []);

  // SMART QUEUE CLEARING: Auto-clear very old messages (5+ minutes)
  const clearStaleMessages = useCallback(() => {
    setQueueState(prev => {
      const now = Date.now();
      const staleMessages = prev.queue.filter(msg => 
        (now - new Date(msg.timestamp).getTime()) > 300000 // 5 minutes old
      );

      if (staleMessages.length > 0) {
        logger.info('🧹 Auto-clearing stale messages', { 
          count: staleMessages.length,
          messageIds: staleMessages.map(m => m.id) 
        });

        // Clear timeouts for removed messages
        staleMessages.forEach(msg => {
          const timeout = processingTimeouts.current.get(msg.id);
          if (timeout) {
            clearTimeout(timeout);
            processingTimeouts.current.delete(msg.id);
          }
        });

        return {
          ...prev,
          queue: prev.queue.filter(msg => !staleMessages.includes(msg)),
          processing: new Set([...prev.processing].filter(id => 
            !staleMessages.some(stale => stale.id === id)
          ))
        };
      }
      return prev;
    });
  }, []);

  // Auto-cleanup timer - runs every 30 seconds
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      clearFailedMessages();
      clearStaleMessages();
    }, 30000);

    return () => clearInterval(cleanupInterval);
  }, [clearFailedMessages, clearStaleMessages]);

  // Memoize queue statistics to prevent re-renders
  const getQueueStats = useMemo(() => {
    const messages = queueState.queue;
    const processingSize = queueState.processing.size;
    
    let queued = 0;
    let failed = 0;
    
    // Single pass through messages for better performance
    for (const message of messages) {
      if (message.status === 'queued') queued++;
      else if (message.status === 'failed') failed++;
    }
    
    const totalActive = queued + failed + processingSize;
    
    return {
      total: messages.length,
      queued,
      processing: processingSize,
      completed: messages.filter(msg => msg.status === 'completed').length,
      failed,
      canProcess: processingSize < queueState.maxConcurrent,
      isEmpty: totalActive === 0
    };
  }, [queueState.queue, queueState.processing.size, queueState.maxConcurrent]);

  // Memoize the return object to prevent re-renders
  const memoizedReturn = useMemo(() => ({
    queue: queueState.queue,
    processing: queueState.processing,
    addToQueue,
    updateMessageStatus,
    getNextQueuedMessage,
    removeFromQueue,
    retryMessage,
    clearQueue,
    clearFailedMessages,
    clearStaleMessages,
    getQueueStats
  }), [
    queueState.queue,
    queueState.processing,
    addToQueue,
    updateMessageStatus,
    getNextQueuedMessage,
    removeFromQueue,
    retryMessage,
    clearQueue,
    clearFailedMessages,
    clearStaleMessages,
    getQueueStats
  ]);

  return memoizedReturn;
};