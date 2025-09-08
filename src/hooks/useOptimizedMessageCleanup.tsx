/**
 * Optimized message cleanup hook for failed and streaming messages
 */

import { useCallback, useRef } from 'react';
import type { ChatMessage } from '@/types/index';

interface CleanupSchedule {
  messageId: string;
  timeoutId: number;
  type: 'failed' | 'streaming';
}

export const useOptimizedMessageCleanup = () => {
  const scheduledCleanups = useRef<Map<string, CleanupSchedule>>(new Map());

  const scheduleFailedMessageCleanup = useCallback((
    messageId: string, 
    updateMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
    delay = 30000
  ) => {
    // Cancel existing cleanup if any
    const existing = scheduledCleanups.current.get(messageId);
    if (existing) {
      clearTimeout(existing.timeoutId);
    }

    // Schedule new cleanup
    const timeoutId = window.setTimeout(() => {
      updateMessages(prev => prev.filter(m => !(m.id === messageId && m.status === 'failed')));
      scheduledCleanups.current.delete(messageId);
    }, delay);

    scheduledCleanups.current.set(messageId, { messageId, timeoutId, type: 'failed' });
  }, []);

  const scheduleStreamingMessageCleanup = useCallback((
    messageId: string,
    updateMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
    delay = 60000
  ) => {
    const existing = scheduledCleanups.current.get(messageId);
    if (existing) {
      clearTimeout(existing.timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      updateMessages(prev => prev.filter(m => !m.id.startsWith(`streaming-${messageId}`)));
      scheduledCleanups.current.delete(messageId);
    }, delay);

    scheduledCleanups.current.set(messageId, { messageId, timeoutId, type: 'streaming' });
  }, []);

  const cancelCleanup = useCallback((messageId: string) => {
    const cleanup = scheduledCleanups.current.get(messageId);
    if (cleanup) {
      clearTimeout(cleanup.timeoutId);
      scheduledCleanups.current.delete(messageId);
    }
  }, []);

  const cancelAllCleanups = useCallback(() => {
    scheduledCleanups.current.forEach(cleanup => clearTimeout(cleanup.timeoutId));
    scheduledCleanups.current.clear();
  }, []);

  return {
    scheduleFailedMessageCleanup,
    scheduleStreamingMessageCleanup,
    cancelCleanup,
    cancelAllCleanups
  };
};