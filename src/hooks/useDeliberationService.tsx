import { useMemo } from 'react';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface DeliberationService {
  getDeliberations(): Promise<any[]>;
  createDeliberation(data: any): Promise<any>;
  joinDeliberation(deliberationId: string): Promise<void>;
  getDeliberation(deliberationId: string): Promise<any>;
  leaveDeliberation(deliberationId: string): Promise<void>;
}

export const useDeliberationService = (): DeliberationService => {
  const { user } = useSupabaseAuth();
  
  //  FIX: Memoize the service object to prevent recreation on every render
  return useMemo(() => ({
    async getDeliberations(): Promise<any[]> {
      logger.info('Starting getDeliberations with Supabase Auth');
      
      const { data: deliberations, error: deliberationsError } = await supabase
        .from('deliberations')
        .select('*')
        .order('created_at', { ascending: false });

      logger.info('Deliberations query result', { count: deliberations?.length || 0, hasError: Boolean(deliberationsError) });

      if (deliberationsError) {
        logger.error('Error fetching deliberations', deliberationsError as any);
        throw deliberationsError;
      }
      if (!deliberations) {
        logger.info('No deliberations found');
        return [];
      }

      logger.info('Found deliberations', { count: deliberations.length });

      const currentUserId = user?.id;
      logger.info('Current user ID for participation check', { currentUserId });

      // Get participant counts for each deliberation - Fixed to get actual count
      const deliberationsWithCounts = await Promise.all(
        deliberations.map(async (deliberation) => {
          logger.info('Getting participant count', { deliberationId: deliberation.id });
          
          // Get actual participant count from participants table
          const { data: participants, error: countError } = await supabase
            .from('participants')
            .select('user_id')
            .eq('deliberation_id', deliberation.id);

          if (countError) {
            logger.warn(`Error getting participants for ${deliberation.id}`, countError as any);
          }

          const participantCount = participants?.length || 0;

          // Check if current user is a participant
          let isUserParticipant = false;
          if (currentUserId && participants) {
            isUserParticipant = participants.some(p => p.user_id === currentUserId);
            
            logger.info('Participation check result', { 
              deliberationId: deliberation.id, 
              currentUserId,
              isUserParticipant,
              totalParticipants: participantCount
            });
          }

          logger.info('Final participant count', { 
            deliberationId: deliberation.id, 
            count: participantCount,
            isUserParticipant
          });

          return {
            ...deliberation,
            participant_count: participantCount,
            is_user_participant: isUserParticipant
          };
        })
      );

      logger.info('Final deliberations with counts', { count: deliberationsWithCounts.length });
      return deliberationsWithCounts;
    },

    async createDeliberation(deliberationData: any): Promise<any> {
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      const facilitatorId = user.id;

      // Create deliberation
      const { data: deliberation, error: deliberationError } = await supabase
        .from('deliberations')
        .insert({
          title: deliberationData.title,
          description: deliberationData.description,
          is_public: deliberationData.is_public,
          max_participants: deliberationData.max_participants,
          facilitator_id: facilitatorId,
          status: 'draft'
        })
        .select()
        .single();

      if (deliberationError) throw deliberationError;

      return deliberation;
    },

    async joinDeliberation(deliberationId: string): Promise<void> {
      logger.info('Starting joinDeliberation with Supabase Auth', { deliberationId });
      
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      const userId = user.id;
      
      logger.info('Using authenticated user for join', { userId });
      
      // Check if already a participant
      const { data: existing, error: existingError } = await supabase
        .from('participants')
        .select('id')
        .eq('deliberation_id', deliberationId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingError) {
        logger.error('Error checking existing participation', existingError as any);
      }

      if (existing) {
        logger.info('User is already a participant, skipping join');
        return;
      }

      // Add as participant
      const { error } = await supabase
        .from('participants')
        .insert({
          deliberation_id: deliberationId,
          user_id: userId,
          role: 'participant'
        });

      if (error) {
        // If it's a duplicate key error, the user is already a participant
        if (error.code === '23505' && error.message.includes('participants_deliberation_id_user_id_key')) {
          logger.info('User is already a participant (caught duplicate key error)');
          return; // Don't throw error, just return successfully
        }
        
        logger.error('Error adding participant', error as any);
        throw error;
      }

      logger.info('Successfully joined deliberation');
    },

    async getDeliberation(deliberationId: string): Promise<any> {
      logger.info('Getting deliberation details', { deliberationId });
      
      const { data, error } = await supabase
        .from('deliberations')
        .select(`
          *,
          participants(
            user_id,
            role,
            joined_at
          )
        `)
        .eq('id', deliberationId)
        .maybeSingle();

      logger.info('Get deliberation result', { hasError: Boolean(error), hasData: Boolean(data) });

      if (error) {
        logger.error('Error getting deliberation', error as any);
        throw error;
      }
      if (!data) {
        logger.error('Deliberation not found');
        throw new Error('Deliberation not found');
      }
      
      // Add participant count as a fallback
      data.participant_count = data.participants?.length || 0;
      
      logger.info('Deliberation details retrieved successfully');
      return data;
    },

    async leaveDeliberation(deliberationId: string): Promise<void> {
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      const userId = user.id;

      const { error } = await supabase
        .from('participants')
        .delete()
        .eq('deliberation_id', deliberationId)
        .eq('user_id', userId);

      if (error) throw error;
    }
    //  FIX: Close useMemo with user dependency
  }), [user]);
};
