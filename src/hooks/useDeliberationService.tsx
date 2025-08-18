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

class SupabaseDeliberationService implements DeliberationService {
  async getDeliberations(): Promise<any[]> {
    logger.info('Starting getDeliberations with simplified auth');
    
    // Set user context for RLS policies
    // Context set automatically via headers
    
    // Query ALL deliberations - the RLS policies will automatically filter
    // to only show deliberations the user can access (public + participated)
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

    // Get current user from localStorage
    const storedUser = localStorage.getItem('simple_auth_user');
    const currentUserId = storedUser ? JSON.parse(storedUser).id : null;
    logger.info('Current user ID for participation check', { currentUserId });

    // Get participant counts for each deliberation (simplified)
    const deliberationsWithCounts = await Promise.all(
      deliberations.map(async (deliberation) => {
        logger.info('Getting participant count', { deliberationId: deliberation.id });
        
        // Set user context before each query to ensure RLS works
        // Context set automatically via headers
        
        // Get total participant count with a simple count query
        const { count, error: countError } = await supabase
          .from('participants')
          .select('id', { count: 'exact', head: true })
          .eq('deliberation_id', deliberation.id);

        if (countError) {
          logger.warn(`Error getting participant count for ${deliberation.id}`, countError as any);
        }

        // Check if current user is a participant
        let isUserParticipant = false;
        if (currentUserId) {
          logger.info('Checking participation for user', { 
            currentUserId, 
            deliberationId: deliberation.id 
          });
          
          // Use the UUID directly for comparison
          const { data: userParticipation, error: participationError } = await supabase
            .from('participants')
            .select('id')
            .eq('deliberation_id', deliberation.id)
            .eq('user_id', currentUserId)
            .maybeSingle();
          
          if (participationError) {
            logger.error('Error checking user participation', participationError as any);
          }
          
          isUserParticipant = !!userParticipation;
          
          logger.info('Participation check result', { 
            deliberationId: deliberation.id, 
            currentUserId,
            userParticipation,
            isUserParticipant
          });
        }

        logger.info('Participant count', { 
          deliberationId: deliberation.id, 
          count,
          isUserParticipant
        });

        return {
          ...deliberation,
          participant_count: count || 0,
          is_user_participant: isUserParticipant
        };
      })
    );

    logger.info('Final deliberations with counts', { count: deliberationsWithCounts.length });
    return deliberationsWithCounts;
  }

  async createDeliberation(deliberationData: any): Promise<any> {
    // Get the current authenticated user from localStorage
    const storedUser = localStorage.getItem('simple_auth_user');
    if (!storedUser) {
      throw new Error('User not authenticated');
    }
    
    const user = JSON.parse(storedUser);
    const facilitatorId = user.id; // Use the actual user UUID

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
  }

  async joinDeliberation(deliberationId: string): Promise<void> {
    logger.info('Starting joinDeliberation with access code auth', { deliberationId });
    
    // Set user context for RLS policies
    // Context set automatically via headers
    
    // Get the current authenticated user from localStorage
    const storedUser = localStorage.getItem('simple_auth_user');
    if (!storedUser) {
      throw new Error('User not authenticated');
    }
    
    const user = JSON.parse(storedUser);
    const userId = user.id; // This is the proper UUID from authentication
    
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
    // Get the current authenticated user from localStorage
    const storedUser = localStorage.getItem('simple_auth_user');
    if (!storedUser) {
      throw new Error('User not authenticated');
    }
    
    const user = JSON.parse(storedUser);
    const userId = user.id; // Use the actual user UUID

    const { error } = await supabase
      .from('participants')
      .delete()
      .eq('deliberation_id', deliberationId)
      .eq('user_id', userId);

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