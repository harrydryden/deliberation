import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
  mode: 'chat' | 'learn';
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

  const addToQueue = useCallback((content: string, parentMessageId?: string, mode: 'chat' | 'learn' = 'chat'): string => {
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
        queue: newQueue
      };
    });

    logger.info('📋 Message added to queue', { 
      messageId, 
      queuePosition: queuedMessage.queuePosition,
      mode
    });

    return messageId;
  }, []); // Remove unstable dependency

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

      // ENHANCED FIX: Prevent invalid state transitions and detect stuck processing
      const isValidTransition = (from: QueuedMessage['status'], to: QueuedMessage['status']): boolean => {
        // Allow re-queueing of failed messages
        if (from === 'failed' && to === 'queued') return true;
        // Allow normal progression
        if (from === 'queued' && to === 'processing') return true;
        if (from === 'processing' && (to === 'completed' || to === 'failed')) return true;
        // Prevent backwards transitions
        if ((from === 'completed' || from === 'failed') && to === 'processing') return false;
        // Allow same-state updates (for error messages)
        if (from === to) return true;
        return true; // Allow other transitions by default
      };

      if (!isValidTransition(message.status, status)) {
        logger.warn('Invalid state transition blocked', { 
          messageId, 
          from: message.status, 
          to: status,
          timestamp: new Date().toISOString()
        });
        return prev;
      }

      const updatedQueue = prev.queue.map(msg => 
        msg.id === messageId 
          ? { ...msg, status, error, retries: error ? msg.retries + 1 : msg.retries }
          : msg
      );

      const newProcessing = new Set(prev.processing);
      
      // ENHANCED PROCESSING STATE MANAGEMENT
      if (status === 'completed' || status === 'failed') {
        newProcessing.delete(messageId);
        // Clear any timeout for this message
        const timeout = processingTimeouts.current.get(messageId);
        if (timeout) {
          clearTimeout(timeout);
          processingTimeouts.current.delete(messageId);
          logger.debug('Cleared processing timeout', { messageId, status });
        }
      } else if (status === 'processing') {
        // RACE CONDITION FIX: Only add to processing if not already there
        if (!newProcessing.has(messageId)) {
          newProcessing.add(messageId);
          logger.debug('Added to processing set', { messageId, processingCount: newProcessing.size });
          
          // ENHANCED TIMEOUT: Shorter timeout with better error handling
          const timeout = setTimeout(() => {
            setQueueState(currentState => {
              const stillExists = currentState.queue.find(msg => msg.id === messageId);
              const stillProcessing = currentState.processing.has(messageId);
              
              if (!stillExists || !stillProcessing) {
                logger.debug('Queue timeout: message no longer processing', { 
                  messageId, 
                  stillExists: !!stillExists,
                  stillProcessing 
                });
                return currentState;
              }
              
              logger.warn('Queue processing timeout - message stuck', { 
                messageId, 
                timeoutSeconds: 90,
                timestamp: new Date().toISOString()
              });
              
              // Direct state update with enhanced cleanup
              const timeoutQueue = currentState.queue.map(msg => 
                msg.id === messageId 
                  ? { 
                      ...msg, 
                      status: 'failed' as const, 
                      error: 'Processing timeout after 90 seconds - message may be stuck',
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
          }, 90000); // Increased to 90s to prevent premature timeouts
          
          processingTimeouts.current.set(messageId, timeout);
        } else {
          logger.debug('Message already in processing state', { messageId });
        }
      }

      return {
        ...prev,
        queue: updatedQueue,
        processing: newProcessing
      };
    });

    // ENHANCED COMPLETION CLEANUP: Remove completed messages faster
    if (status === 'completed') {
      const completionTimeout = setTimeout(() => {
        logger.debug('Auto-removing completed message', { messageId });
        removeFromQueue(messageId);
      }, 3000); // Reduced back to 3s for faster cleanup
      completionTimeouts.current.set(messageId, completionTimeout);
    }

    logger.info('🔄 Queue message status updated', { 
      messageId, 
      status, 
      error: error?.substring(0, 100), // Truncate long errors
      timestamp: new Date().toISOString()
    });
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