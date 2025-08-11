import { useBackendAuth } from '@/hooks/useBackendAuth';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface DeliberationService {
  getDeliberations(): Promise<any[]>;
  createDeliberation(data: any): Promise<any>;
  joinDeliberation(deliberationId: string): Promise<void>;
  getDeliberation(deliberationId: string): Promise<any>;
  leaveDeliberation(deliberationId: string): Promise<void>;
}

class SupabaseDeliberationService implements DeliberationService {
  async getDeliberations(): Promise<any[]> {
    logger.info('Starting getDeliberations');
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    
    // First get deliberations
    const { data: deliberations, error: deliberationsError } = await supabase
      .from('deliberations')
      .select('*')
      .eq('is_public', true)
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

    // Then get participant counts and check user participation for each deliberation
    const deliberationsWithCounts = await Promise.all(
      deliberations.map(async (deliberation) => {
        logger.info('Getting participant count', { deliberationId: deliberation.id });
        
        // Get total participant count
        const { count, error: countError } = await supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('deliberation_id', deliberation.id);

        if (countError) {
          logger.warn(`Error getting participant count for ${deliberation.id}`, countError as any);
        }

        // Check if current user is a participant
        const { data: userParticipation, error: participationError } = await supabase
          .from('participants')
          .select('id')
          .eq('deliberation_id', deliberation.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (participationError) {
          logger.warn(`Error checking user participation for ${deliberation.id}`, participationError as any);
        }

        logger.info('Participant count and user participation', { 
          deliberationId: deliberation.id, 
          count, 
          isParticipant: !!userParticipation 
        });

        return {
          ...deliberation,
          participant_count: count || 0,
          is_user_participant: !!userParticipation
        };
      })
    );

    logger.info('Final deliberations with counts', { count: deliberationsWithCounts.length });
    return deliberationsWithCounts;
  }

  async createDeliberation(deliberationData: any): Promise<any> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Create deliberation
    const { data: deliberation, error: deliberationError } = await supabase
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

    if (deliberationError) throw deliberationError;

    // Add creator as participant and facilitator
    const { error: participantError } = await supabase
      .from('participants')
      .insert({
        deliberation_id: deliberation.id,
        user_id: user.id,
        role: 'facilitator'
      });

    if (participantError) throw participantError;

    return deliberation;
  }

  async joinDeliberation(deliberationId: string): Promise<void> {
    logger.info('Starting joinDeliberation', { deliberationId });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logger.error('User not authenticated');
      throw new Error('User not authenticated');
    }

    logger.info('User authenticated', { userId: user.id });

    // Check if already a participant
    logger.info('Checking if user is already a participant...');
    const { data: existing, error: checkError } = await supabase
      .from('participants')
      .select('id')
      .eq('deliberation_id', deliberationId)
      .eq('user_id', user.id)
      .maybeSingle();

    logger.info('Existing participant check result', { exists: Boolean(existing), hasError: Boolean(checkError) });

    if (checkError) {
      logger.error('Error checking existing participant', checkError as any);
      throw checkError;
    }

    if (existing) {
      logger.info('User is already a participant, skipping join');
      return; // Already a participant
    }

    // Add as participant
    logger.info('Adding user as participant...');
    const { error } = await supabase
      .from('participants')
      .insert({
        deliberation_id: deliberationId,
        user_id: user.id,
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
  }

  async leaveDeliberation(deliberationId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('participants')
      .delete()
      .eq('deliberation_id', deliberationId)
      .eq('user_id', user.id);

    if (error) throw error;
  }
}

class NodejsDeliberationService implements DeliberationService {
  private getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  async getDeliberations(): Promise<any[]> {
    const response = await fetch('/api/v1/deliberations', {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to fetch deliberations');
    }

    return response.json();
  }

  async createDeliberation(deliberationData: any): Promise<any> {
    const response = await fetch('/api/v1/deliberations', {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(deliberationData)
    });

    if (!response.ok) {
      throw new Error('Failed to create deliberation');
    }

    return response.json();
  }

  async joinDeliberation(deliberationId: string): Promise<void> {
    const response = await fetch('/api/v1/deliberations/join', {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ deliberationId })
    });

    if (!response.ok) {
      throw new Error('Failed to join deliberation');
    }
  }

  async getDeliberation(deliberationId: string): Promise<any> {
    const response = await fetch(`/api/v1/deliberations/${deliberationId}`, {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to fetch deliberation');
    }

    return response.json();
  }

  async leaveDeliberation(deliberationId: string): Promise<void> {
    const response = await fetch(`/api/v1/deliberations/${deliberationId}/leave`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to leave deliberation');
    }
  }
}

export const useDeliberationService = (): DeliberationService => {
  // For now, always use Supabase since that's what's configured
  return new SupabaseDeliberationService();
};