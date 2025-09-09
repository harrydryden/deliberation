/**
 * Production-optimized message cleanup hook with error boundary integration
 */

import { useCallback, useRef } from 'react';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { productionLogger } from '@/utils/productionLogger';
import type { ChatMessage } from '@/types/index';

interface CleanupSchedule {
  messageId: string;
  timeoutId: number;
  type: 'failed' | 'streaming';
}

export const useOptimizedMessageCleanup = () => {
  const scheduledCleanups = useRef<Map<string, CleanupSchedule>>(new Map());
  const { handleError } = useErrorHandler();

  const scheduleFailedMessageCleanup = useCallback((
    messageId: string, 
    updateMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
    delay = 30000
  ) => {
    try {
      // Cancel existing cleanup if any
      const existing = scheduledCleanups.current.get(messageId);
      if (existing) {
        clearTimeout(existing.timeoutId);
      }

      // Schedule new cleanup
      const timeoutId = window.setTimeout(() => {
        try {
          updateMessages(prev => prev.filter(m => !(m.id === messageId && m.status === 'failed')));
          scheduledCleanups.current.delete(messageId);
        } catch (error) {
          handleError(error, 'message cleanup');
        }
      }, delay);

      scheduledCleanups.current.set(messageId, { messageId, timeoutId, type: 'failed' });
    } catch (error) {
      productionLogger.error('Failed to schedule message cleanup', error);
      handleError(error, 'cleanup scheduling');
    }
  }, [handleError]);

  const scheduleStreamingMessageCleanup = useCallback((
    messageId: string,
    updateMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
    delay = 60000
  ) => {
    try {
      const existing = scheduledCleanups.current.get(messageId);
      if (existing) {
        clearTimeout(existing.timeoutId);
      }

      const timeoutId = window.setTimeout(() => {
        try {
          updateMessages(prev => prev.filter(m => !m.id.startsWith(`streaming-${messageId}`)));
          scheduledCleanups.current.delete(messageId);
        } catch (error) {
          handleError(error, 'streaming cleanup');
        }
      }, delay);

      scheduledCleanups.current.set(messageId, { messageId, timeoutId, type: 'streaming' });
    } catch (error) {
      productionLogger.error('Failed to schedule streaming cleanup', error);
      handleError(error, 'streaming cleanup scheduling');
    }
  }, [handleError]);

  const cancelCleanup = useCallback((messageId: string) => {
    try {
      const cleanup = scheduledCleanups.current.get(messageId);
      if (cleanup) {
        clearTimeout(cleanup.timeoutId);
        scheduledCleanups.current.delete(messageId);
      }
    } catch (error) {
      productionLogger.error('Failed to cancel cleanup', error);
    }
  }, []);

  const cancelAllCleanups = useCallback(() => {
    try {
      scheduledCleanups.current.forEach(cleanup => clearTimeout(cleanup.timeoutId));
      scheduledCleanups.current.clear();
    } catch (error) {
      productionLogger.error('Failed to cancel all cleanups', error);
    }
  }, []);

  return {
    scheduleFailedMessageCleanup,
    scheduleStreamingMessageCleanup,
    cancelCleanup,
    cancelAllCleanups
  };
};