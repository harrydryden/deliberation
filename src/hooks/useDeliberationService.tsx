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
    console.log('🔍 Starting getDeliberations...');
    
    // First get deliberations
    const { data: deliberations, error: deliberationsError } = await supabase
      .from('deliberations')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    console.log('📊 Deliberations query result:', { deliberations, deliberationsError });

    if (deliberationsError) {
      console.error('❌ Error fetching deliberations:', deliberationsError);
      throw deliberationsError;
    }
    if (!deliberations) {
      console.log('📭 No deliberations found');
      return [];
    }

    console.log(`📋 Found ${deliberations.length} deliberations`);

    // Then get participant counts for each deliberation
    const deliberationsWithCounts = await Promise.all(
      deliberations.map(async (deliberation) => {
        console.log(`🔢 Getting participant count for deliberation ${deliberation.id}`);
        const { count, error: countError } = await supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('deliberation_id', deliberation.id);

        if (countError) {
          console.error(`❌ Error getting participant count for ${deliberation.id}:`, countError);
        }

        console.log(`👥 Participant count for ${deliberation.id}: ${count}`);

        return {
          ...deliberation,
          participant_count: count || 0
        };
      })
    );

    console.log('✅ Final deliberations with counts:', deliberationsWithCounts);
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
    console.log(`🚀 Starting joinDeliberation for ID: ${deliberationId}`);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ User not authenticated');
      throw new Error('User not authenticated');
    }

    console.log(`👤 User authenticated: ${user.id}`);

    // Check if already a participant
    console.log('🔍 Checking if user is already a participant...');
    const { data: existing, error: checkError } = await supabase
      .from('participants')
      .select('id')
      .eq('deliberation_id', deliberationId)
      .eq('user_id', user.id)
      .maybeSingle();

    console.log('📊 Existing participant check result:', { existing, checkError });

    if (checkError) {
      console.error('❌ Error checking existing participant:', checkError);
      throw checkError;
    }

    if (existing) {
      console.log('✅ User is already a participant, skipping join');
      return; // Already a participant
    }

    // Add as participant
    console.log('➕ Adding user as participant...');
    const { error } = await supabase
      .from('participants')
      .insert({
        deliberation_id: deliberationId,
        user_id: user.id,
        role: 'participant'
      });

    if (error) {
      console.error('❌ Error adding participant:', error);
      throw error;
    }

    console.log('✅ Successfully joined deliberation');
  }

  async getDeliberation(deliberationId: string): Promise<any> {
    console.log(`🔍 Getting deliberation details for ID: ${deliberationId}`);
    
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
      .maybeSingle();

    console.log('📊 Get deliberation result:', { data, error });

    if (error) {
      console.error('❌ Error getting deliberation:', error);
      throw error;
    }
    if (!data) {
      console.error('❌ Deliberation not found');
      throw new Error('Deliberation not found');
    }
    
    console.log('✅ Deliberation details retrieved successfully');
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