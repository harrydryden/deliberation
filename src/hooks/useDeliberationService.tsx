import { useBackendAuth } from '@/hooks/useBackendAuth';
import { supabase } from '@/integrations/supabase/client';

interface DeliberationService {
  getDeliberations(): Promise<any[]>;
  createDeliberation(data: any): Promise<any>;
  joinDeliberation(deliberationId: string): Promise<void>;
  getDeliberation(deliberationId: string): Promise<any>;
  leaveDeliberation(deliberationId: string): Promise<void>;
}

class SupabaseDeliberationService implements DeliberationService {
  async getDeliberations(): Promise<any[]> {
    // First get deliberations
    const { data: deliberations, error: deliberationsError } = await supabase
      .from('deliberations')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (deliberationsError) throw deliberationsError;
    if (!deliberations) return [];

    // Then get participant counts for each deliberation
    const deliberationsWithCounts = await Promise.all(
      deliberations.map(async (deliberation) => {
        const { count } = await supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('deliberation_id', deliberation.id);

        return {
          ...deliberation,
          participant_count: count || 0
        };
      })
    );

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Check if already a participant
    const { data: existing } = await supabase
      .from('participants')
      .select('id')
      .eq('deliberation_id', deliberationId)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      return; // Already a participant
    }

    // Add as participant
    const { error } = await supabase
      .from('participants')
      .insert({
        deliberation_id: deliberationId,
        user_id: user.id,
        role: 'participant'
      });

    if (error) throw error;
  }

  async getDeliberation(deliberationId: string): Promise<any> {
    const { data, error } = await supabase
      .from('deliberations')
      .select(`
        *,
        participants(
          user_id,
          role,
          joined_at,
          profiles!inner(display_name, avatar_url)
        )
      `)
      .eq('id', deliberationId)
      .single();

    if (error) throw error;
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