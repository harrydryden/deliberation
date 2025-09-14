import { useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

interface DeliberationService {
  getDeliberations(): Promise<any[]>;
  createDeliberation(data: any): Promise<any>;
  joinDeliberation(deliberationId: string): Promise<void>;
  getDeliberation(deliberationId: string): Promise<any>;
  leaveDeliberation(deliberationId: string): Promise<void>;
}

export const useOptimizedDeliberationService = (): DeliberationService => {
  const { user } = useSupabaseAuth();
  
  // Memoize all service methods to prevent recreation
  const service = useMemo(() => ({
    async getDeliberations(): Promise<any[]> {
      logger.info('Starting getDeliberations');
      
      const { data: deliberations, error } = await supabase
        .from('deliberations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching deliberations', error as any);
        throw error;
      }
      
      if (!deliberations) return [];

      const currentUserId = user?.id;
      
      // Get participant counts efficiently
      const deliberationsWithCounts = await Promise.all(
        deliberations.map(async (deliberation) => {
          const { data: participants } = await supabase
            .from('participants')
            .select('user_id')
            .eq('deliberation_id', deliberation.id);

          const participantCount = participants?.length || 0;
          const isUserParticipant = currentUserId && participants 
            ? participants.some(p => p.user_id === currentUserId)
            : false;

          return {
            ...deliberation,
            participant_count: participantCount,
            is_user_participant: isUserParticipant
          };
        })
      );

      return deliberationsWithCounts;
    },

    async createDeliberation(deliberationData: any): Promise<any> {
      if (!user) throw new Error('User not authenticated');
      
      const { data: deliberation, error } = await supabase
        .from('deliberations')
        .insert({
          title: deliberationData.title,
          description: deliberationData.description,
          is_public: deliberationData.is_public,
          max_participants: deliberationData.max_participants,
          facilitator_id: user.id,
          status: 'draft'
        })
        .select()
        .single();

      if (error) throw error;
      return deliberation;
    },

    async joinDeliberation(deliberationId: string): Promise<void> {
      if (!user) throw new Error('User not authenticated');
      
      const { data: existing } = await supabase
        .from('participants')
        .select('id')
        .eq('deliberation_id', deliberationId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) return; // Already a participant

      const { error } = await supabase
        .from('participants')
        .insert({
          deliberation_id: deliberationId,
          user_id: user.id,
          role: 'participant'
        });

      if (error && !(error.code === '23505' && error.message.includes('participants_deliberation_id_user_id_key'))) {
        throw error;
      }
    },

    async getDeliberation(deliberationId: string): Promise<any> {
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

      if (error) throw error;
      if (!data) throw new Error('Deliberation not found');
      
      data.participant_count = data.participants?.length || 0;
      return data;
    },

    async leaveDeliberation(deliberationId: string): Promise<void> {
      if (!user) throw new Error('User not authenticated');
      
      const { error } = await supabase
        .from('participants')
        .delete()
        .eq('deliberation_id', deliberationId)
        .eq('user_id', user.id);

      if (error) throw error;
    }
  }), [user]);

  return service;
};