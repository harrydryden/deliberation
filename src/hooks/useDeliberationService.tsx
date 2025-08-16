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
    
    // Since we're using simplified access code authentication,
    // we don't need to check Supabase auth - just fetch public deliberations
    // and let the RLS policies handle access control
    
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

    // Get participant counts for each deliberation (simplified)
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

        logger.info('Participant count', { 
          deliberationId: deliberation.id, 
          count
        });

        return {
          ...deliberation,
          participant_count: count || 0,
          is_user_participant: false // Simplified - user can always join
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
    
    // Generate a deterministic UUID for the user
    const crypto = window.crypto || (window as any).msCrypto;
    const encoder = new TextEncoder();
    const data = encoder.encode(user.id);
    const hashArray = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashArray))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const facilitatorId = [
      hashHex.slice(0, 8),
      hashHex.slice(8, 12),
      hashHex.slice(12, 16),
      hashHex.slice(16, 20),
      hashHex.slice(20, 32)
    ].join('-');

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
    logger.info('Starting joinDeliberation with simplified auth', { deliberationId });
    
    // Get the current authenticated user from localStorage
    const storedUser = localStorage.getItem('simple_auth_user');
    if (!storedUser) {
      throw new Error('User not authenticated');
    }
    
    const user = JSON.parse(storedUser);
    const userId = user.id; // This should be in format "access_ACCESSCODE"
    
    logger.info('Using authenticated user for join', { userId });
    
    // Convert to a valid UUID format for database compatibility
    // We'll use a deterministic UUID based on the access code
    const crypto = window.crypto || (window as any).msCrypto;
    const encoder = new TextEncoder();
    const data = encoder.encode(userId);
    const hashArray = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashArray))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Convert hash to UUID format (8-4-4-4-12)
    const uuidFromHash = [
      hashHex.slice(0, 8),
      hashHex.slice(8, 12),
      hashHex.slice(12, 16),
      hashHex.slice(16, 20),
      hashHex.slice(20, 32)
    ].join('-');
    
    logger.info('Generated UUID for participant', { originalId: userId, uuid: uuidFromHash });
    
    // Check if already a participant
    const { data: existing } = await supabase
      .from('participants')
      .select('id')
      .eq('deliberation_id', deliberationId)
      .eq('user_id', uuidFromHash)
      .maybeSingle();

    if (existing) {
      logger.info('User is already a participant, skipping join');
      return;
    }

    // Add as participant
    const { error } = await supabase
      .from('participants')
      .insert({
        deliberation_id: deliberationId,
        user_id: uuidFromHash,
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
    // Get the current authenticated user from localStorage
    const storedUser = localStorage.getItem('simple_auth_user');
    if (!storedUser) {
      throw new Error('User not authenticated');
    }
    
    const user = JSON.parse(storedUser);
    
    // Generate the same deterministic UUID we used for joining
    const crypto = window.crypto || (window as any).msCrypto;
    const encoder = new TextEncoder();
    const data = encoder.encode(user.id);
    const hashArray = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashArray))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const userId = [
      hashHex.slice(0, 8),
      hashHex.slice(8, 12),
      hashHex.slice(12, 16),
      hashHex.slice(16, 20),
      hashHex.slice(20, 32)
    ].join('-');

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