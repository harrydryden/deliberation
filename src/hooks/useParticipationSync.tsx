import { useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';
import { supabase } from '@/integrations/supabase/client';

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

  // Sync participation status with database
  const syncParticipationStatus = useCallback(async () => {
    if (!deliberationId || !userId) return;

    try {
      const now = Date.now();
      // Prevent too frequent syncs (max once per 5 seconds)
      if (now - lastSyncRef.current < 5000) return;
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

      // Update state if there's a mismatch
      if (isParticipant !== isActuallyParticipant) {
        logger.info('Participation status mismatch detected, updating', {
          from: isParticipant,
          to: isActuallyParticipant,
          deliberationId,
          userId
        });

        onParticipationUpdate(isActuallyParticipant);

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

  // Set up periodic sync
  useEffect(() => {
    if (!deliberationId || !userId) return;

    // Initial sync after a short delay
    const initialTimeout = setTimeout(syncParticipationStatus, 1000);

    // Periodic sync every 30 seconds
    syncIntervalRef.current = setInterval(syncParticipationStatus, 30000);

    return () => {
      clearTimeout(initialTimeout);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [deliberationId, userId, syncParticipationStatus]);

  // Manual sync function for recovery scenarios
  const forceSyncParticipation = useCallback(() => {
    lastSyncRef.current = 0; // Reset throttle
    syncParticipationStatus();
  }, [syncParticipationStatus]);

  return {
    forceSyncParticipation
  };
};