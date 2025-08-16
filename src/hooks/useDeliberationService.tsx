import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface DeliberationService {
  getDeliberations(): Promise<any[]>;
  createDeliberation(data: any): Promise<any>;
  joinDeliberation(deliberationId: string): Promise<void>;
  getDeliberation(deliberationId: string): Promise<any>;
  leaveDeliberation(deliberationId: string): Promise<void>;
}

class SimpleDeliberationService implements DeliberationService {
  private user: any;
  
  constructor(user: any) {
    this.user = user;
  }
  
  async getDeliberations(): Promise<any[]> {
    logger.info('Starting getDeliberations');
    
    if (!this.user) throw new Error('User not authenticated');
    
    // Get public deliberations with simplified queries
    const { data: deliberations, error: deliberationsError } = await supabase
      .from('deliberations')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (deliberationsError) {
      logger.error('Error fetching deliberations', deliberationsError as any);
      throw deliberationsError;
    }
    
    if (!deliberations) {
      return [];
    }

    // Simplified participant counting - get counts for all deliberations at once
    const deliberationIds = deliberations.map(d => d.id);
    
    const { data: participantCounts, error: countError } = await supabase
      .from('participants')
      .select('deliberation_id')
      .in('deliberation_id', deliberationIds);

    if (countError) {
      logger.warn('Error getting participant counts', countError as any);
    }

    // Count participants per deliberation
    const counts = participantCounts?.reduce((acc, p) => {
      acc[p.deliberation_id] = (acc[p.deliberation_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    // Check user participation for all deliberations at once
    const { data: userParticipations, error: participationError } = await supabase
      .from('participants')
      .select('deliberation_id')
      .in('deliberation_id', deliberationIds)
      .eq('user_id', this.user.id);

    if (participationError) {
      logger.warn('Error checking user participation', participationError as any);
    }

    const userParticipationSet = new Set(userParticipations?.map(p => p.deliberation_id) || []);

    // Map results
    const result = deliberations.map(deliberation => ({
      ...deliberation,
      participant_count: counts[deliberation.id] || 0,
      is_user_participant: userParticipationSet.has(deliberation.id)
    }));

    logger.info('Deliberations loaded successfully', { count: result.length });
    return result;
  }

  async createDeliberation(deliberationData: any): Promise<any> {
    if (!this.user) throw new Error('User not authenticated');

    // Create deliberation
    const { data: deliberation, error: deliberationError } = await supabase
      .from('deliberations')
      .insert({
        title: deliberationData.title,
        description: deliberationData.description,
        is_public: deliberationData.is_public,
        max_participants: deliberationData.max_participants,
        facilitator_id: this.user.id,
        status: 'draft'
      })
      .select()
      .single();

    if (deliberationError) throw deliberationError;

    // Add creator as participant and facilitator
    const { error: participantError } = await supabase
      .from('participants')
      .insert({
        deliberation_id: deliberation.id,
        user_id: this.user.id,
        role: 'facilitator'
      });

    if (participantError) throw participantError;

    return deliberation;
  }

  async joinDeliberation(deliberationId: string): Promise<void> {
    logger.info('Starting joinDeliberation', { deliberationId });
    
    if (!this.user) {
      logger.error('User not authenticated');
      throw new Error('User not authenticated');
    }

    logger.info('User authenticated', { userId: this.user.id });

    // Check if already a participant
    const { data: existing, error: checkError } = await supabase
      .from('participants')
      .select('id')
      .eq('deliberation_id', deliberationId)
      .eq('user_id', this.user.id)
      .maybeSingle();

    if (checkError) {
      logger.error('Error checking existing participant', checkError as any);
      throw checkError;
    }

    if (existing) {
      logger.info('User is already a participant, skipping join');
      return; // Already a participant
    }

    // Add as participant
    const { error } = await supabase
      .from('participants')
      .insert({
        deliberation_id: deliberationId,
        user_id: this.user.id,
        role: 'participant'
      });

    if (error) {
      logger.error('Error adding participant', error as any);
      throw error;
    }

    logger.info('Successfully joined deliberation');
  }

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
  }

  async leaveDeliberation(deliberationId: string): Promise<void> {
    if (!this.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('participants')
      .delete()
      .eq('deliberation_id', deliberationId)
      .eq('user_id', this.user.id);

    if (error) throw error;
  }
}

export const useDeliberationService = (): DeliberationService => {
  const { user } = useAuth();
  return new SimpleDeliberationService(user);
};