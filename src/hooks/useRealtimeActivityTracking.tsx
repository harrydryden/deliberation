import { useCallback, useRef, useEffect } from 'react';
import { useSessionTracking } from './useSessionTracking';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export interface ActivityEvent {
  type: 'message_sent' | 'message_viewed' | 'ibis_submission' | 'voice_interaction' | 'proactive_response' | 'page_focus' | 'rating_given';
  context?: {
    deliberationId?: string;
    messageId?: string;
    duration?: number;
    metadata?: Record<string, any>;
  };
}

interface UseRealtimeActivityTrackingOptions {
  userId?: string;
  deliberationId?: string;
  enabled?: boolean;
}

export const useRealtimeActivityTracking = (options: UseRealtimeActivityTrackingOptions = {}) => {
  const { userId, deliberationId, enabled = true } = options;
  const { currentSession, updateActivity } = useSessionTracking();
  const lastActivityRef = useRef<number>(Date.now());
  const activityQueueRef = useRef<ActivityEvent[]>([]);
  const processingRef = useRef<boolean>(false);

  // Cleanup timeouts ref
  const timeoutRef = useRef<NodeJS.Timeout>();
  const subscriptionRef = useRef<(() => void) | null>(null);

  // Batch process activities to avoid overwhelming the database
  const processActivityQueue = useCallback(async () => {
    if (processingRef.current || activityQueueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;
    const activities = [...activityQueueRef.current];
    activityQueueRef.current = [];

    try {
      // Insert all activities in a single batch
      const activityRecords = activities.map(activity => ({
        user_id: userId,
        session_id: currentSession?.id,
        deliberation_id: deliberationId,
        activity_type: activity.type,
        activity_data: {
          ...activity.context,
          timestamp: new Date().toISOString(),
          session_duration: currentSession ? Date.now() - new Date(currentSession.created_at).getTime() : 0
        },
        created_at: new Date().toISOString()
      }));

      // Store in a simple activity log table
      const { error } = await supabase
        .from('user_activity_logs')
        .insert(activityRecords);

      if (error) {
        logger.error('Failed to record activities', { error, count: activities.length });
        // Re-queue failed activities for retry
        activityQueueRef.current.unshift(...activities);
      } else {
        logger.info('Successfully recorded activities', { count: activities.length });
      }
    } catch (error) {
      logger.error('Error processing activity queue', { error });
      // Re-queue activities for retry
      activityQueueRef.current.unshift(...activities);
    } finally {
      processingRef.current = false;
    }
  }, [userId, currentSession, deliberationId]);

  // Record a single activity event
  const recordActivity = useCallback((event: ActivityEvent) => {
    if (!enabled || !userId || !currentSession) {
      return;
    }

    // Update session activity tracking
    updateActivity();
    
    // Add to activity queue
    activityQueueRef.current.push(event);
    lastActivityRef.current = Date.now();

    // Process queue if it's getting full or after a delay
    if (activityQueueRef.current.length >= 5) {
      processActivityQueue();
    } else {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Process after a short delay to batch activities
      timeoutRef.current = setTimeout(processActivityQueue, 2000);
    }

    logger.debug('Activity recorded', { type: event.type, context: event.context });
  }, [enabled, userId, currentSession, updateActivity, processActivityQueue]);

  // Convenience methods for common activities
  const recordMessageSent = useCallback((messageId?: string, messageType?: string) => {
    recordActivity({
      type: 'message_sent',
      context: {
        deliberationId,
        messageId,
        metadata: { messageType }
      }
    });
  }, [recordActivity, deliberationId]);

  const recordMessageViewed = useCallback((messageId: string, viewDuration?: number) => {
    recordActivity({
      type: 'message_viewed',
      context: {
        deliberationId,
        messageId,
        duration: viewDuration
      }
    });
  }, [recordActivity, deliberationId]);

  const recordIbisSubmission = useCallback((nodeId?: string, nodeType?: string) => {
    recordActivity({
      type: 'ibis_submission',
      context: {
        deliberationId,
        metadata: { nodeId, nodeType }
      }
    });
  }, [recordActivity, deliberationId]);

  const recordVoiceInteraction = useCallback((interactionType: 'start' | 'end' | 'message', duration?: number) => {
    recordActivity({
      type: 'voice_interaction',
      context: {
        deliberationId,
        duration,
        metadata: { interactionType }
      }
    });
  }, [recordActivity, deliberationId]);

  const recordProactiveResponse = useCallback((promptId?: string, responseType?: 'accepted' | 'dismissed' | 'opted_out') => {
    recordActivity({
      type: 'proactive_response',
      context: {
        deliberationId,
        metadata: { promptId, responseType }
      }
    });
  }, [recordActivity, deliberationId]);

  const recordPageFocus = useCallback((focused: boolean, duration?: number) => {
    recordActivity({
      type: 'page_focus',
      context: {
        deliberationId,
        duration,
        metadata: { focused }
      }
    });
  }, [recordActivity, deliberationId]);

  const recordRatingGiven = useCallback((messageId: string, rating: number) => {
    recordActivity({
      type: 'rating_given',
      context: {
        deliberationId,
        messageId,
        metadata: { rating }
      }
    });
  }, [recordActivity, deliberationId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Process remaining activities before unmount
      if (activityQueueRef.current.length > 0) {
        processActivityQueue();
      }
      
      // Clean up subscription if exists
      if (subscriptionRef.current) {
        subscriptionRef.current();
      }
    };
  }, [processActivityQueue]);

  return {
    recordActivity,
    recordMessageSent,
    recordMessageViewed,
    recordIbisSubmission,
    recordVoiceInteraction,
    recordProactiveResponse,
    recordPageFocus,
    recordRatingGiven,
    currentSession,
    isEnabled: enabled && !!currentSession
  };
};