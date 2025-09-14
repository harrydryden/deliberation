import { useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseParticipationSyncProps {
  deliberationId: string;
  userId: string;
  isParticipant: boolean;
  onParticipationUpdate: (isParticipant: boolean) => void;
}

export const useParticipationSync = ({
  deliberationId,
  userId,
  isParticipant,
  onParticipationUpdate
}: UseParticipationSyncProps) => {
  const { toast } = useToast();
  const lastSyncRef = useRef<number>(0);
  const syncIntervalRef = useRef<NodeJS.Timeout>();
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  // Debounced callback to prevent loops
  const debouncedUpdateRef = useRef<NodeJS.Timeout>();
  
  // Sync participation status with database
  const syncParticipationStatus = useCallback(async () => {
    // Early return if no required data
    if (!deliberationId || !userId) return;

    try {
      const now = Date.now();
      // Prevent too frequent syncs (max once per 10 seconds)
      if (now - lastSyncRef.current < 10000) return;
      lastSyncRef.current = now;

      logger.debug('Syncing participation status', { deliberationId, userId });

      const { data: participants, error } = await supabase
        .from('participants')
        .select('user_id')
        .eq('deliberation_id', deliberationId)
        .eq('user_id', userId);

      if (error) {
        logger.error('Error syncing participation status', error);
        return;
      }

      const isActuallyParticipant = participants && participants.length > 0;
      
      logger.debug('Participation sync result', {
        currentState: isParticipant,
        actualState: isActuallyParticipant,
        needsUpdate: isParticipant !== isActuallyParticipant
      });

      // Update state if there's a mismatch, with debouncing to prevent loops
      if (isParticipant !== isActuallyParticipant) {
        logger.info('Participation status mismatch detected, updating', {
          from: isParticipant,
          to: isActuallyParticipant,
          deliberationId,
          userId
        });

        // Clear existing debounce
        if (debouncedUpdateRef.current) {
          clearTimeout(debouncedUpdateRef.current);
        }

        // Debounced update to prevent callback loops
        debouncedUpdateRef.current = setTimeout(() => {
          onParticipationUpdate(isActuallyParticipant);
        }, 500);

        // Notify user of the correction
        if (isActuallyParticipant && !isParticipant) {
          toast({
            title: "Status Updated",
            description: "You are confirmed as a participant in this deliberation",
          });
        } else if (!isActuallyParticipant && isParticipant) {
          toast({
            title: "Status Updated",
            description: "Your participation status has been corrected",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      logger.error('Unexpected error syncing participation', error);
    }
  }, [deliberationId, userId, isParticipant, onParticipationUpdate, toast]);

  // Set up real-time subscription and periodic sync
  useEffect(() => {
    // Don't set up sync if we don't have required data
    if (!deliberationId || !userId) return;

    // Initial sync after a short delay
    const initialTimeout = setTimeout(syncParticipationStatus, 1000);

    // Set up real-time subscription for participation changes
    const channelName = `participation-${deliberationId}`;
    realtimeChannelRef.current = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'participants',
          filter: `deliberation_id=eq.${deliberationId}`
        },
        (payload) => {
          logger.debug('Real-time participation change detected', { 
            event: payload.eventType, 
            payload: payload.new || payload.old,
            deliberationId 
          });
          
          // Force sync when participation changes occur
          forceSyncParticipation();
        }
      )
      .subscribe((status) => {
        logger.debug('Participation subscription status', { status, deliberationId });
      });

    // Reduced periodic sync: every 5 minutes as backup
    syncIntervalRef.current = setInterval(syncParticipationStatus, 300000); // 5 minutes

    return () => {
      clearTimeout(initialTimeout);
      if (debouncedUpdateRef.current) {
        clearTimeout(debouncedUpdateRef.current);
      }
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [deliberationId, userId]); // Removed syncParticipationStatus dependency to prevent recreation

  // Manual sync function for recovery scenarios
  const forceSyncParticipation = useCallback(() => {
    lastSyncRef.current = 0; // Reset throttle
    syncParticipationStatus();
  }, [syncParticipationStatus]);

  return {
    forceSyncParticipation
  };
};