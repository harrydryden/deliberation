import { supabase } from '@/integrations/supabase/client';
import { IAdminService, AccessCode, AdminStats } from '../base.service';
import { User, Agent, Deliberation } from '@/types/api';

export class SupabaseAdminService implements IAdminService {
  // Users
  async getUsers(): Promise<User[]> {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, display_name, user_role, expertise_areas, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return profiles?.map(profile => ({
      id: profile.id,
      accessCode: '', // Not stored in profiles
      profile: {
        displayName: profile.display_name || '',
        expertiseAreas: profile.expertise_areas || []
      }
    })) || [];
  }

  async updateUserRole(userId: string, role: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ user_role: role })
      .eq('id', userId);

    if (error) throw error;
  }

  async deleteUser(userId: string): Promise<void> {
    // Note: In production, you'd typically want to soft delete or archive users
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) throw error;
  }

  // Access Codes
  async getAccessCodes(): Promise<AccessCode[]> {
    const { data, error } = await supabase
      .from('access_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createAccessCode(codeType: string): Promise<AccessCode> {
    // Simple random code generation for performance
    const code = Math.random().toString(36).substring(2, 12).toUpperCase();
    
    const { data, error } = await supabase
      .from('access_codes')
      .insert([{ code, code_type: codeType }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteAccessCode(id: string): Promise<void> {
    const { error } = await supabase
      .from('access_codes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // Agents
  async getAgentConfigurations(): Promise<Agent[]> {
    const { data, error } = await supabase
      .from('agent_configurations')
      .select('*')
      .is('deliberation_id', null)  // Only global agents
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data?.map(config => ({
      id: config.id,
      name: config.name,
      description: config.description || '',
      system_prompt: config.system_prompt || '',
      response_style: config.response_style,
      goals: config.goals || [],
      agent_type: config.agent_type,
      facilitator_config: config.facilitator_config || undefined,
      is_default: config.is_default || false,
      isActive: config.is_active,
      createdAt: config.created_at,
      updatedAt: config.updated_at
    })) || [];
  }

  async getLocalAgentConfigurations(): Promise<Agent[]> {
    const { data, error } = await supabase
      .from('agent_configurations')
      .select(`
        *,
        deliberations:deliberation_id (
          id,
          title,
          status
        )
      `)
      .not('deliberation_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data?.map(config => ({
      id: config.id,
      name: config.name,
      description: config.description || '',
      system_prompt: config.system_prompt || '',
      response_style: config.response_style,
      goals: config.goals || [],
      agent_type: config.agent_type,
      facilitator_config: config.facilitator_config || undefined,
      is_default: config.is_default || false,
      isActive: config.is_active,
      createdAt: config.created_at,
      updatedAt: config.updated_at,
      deliberation: config.deliberations ? {
        id: config.deliberations.id,
        title: config.deliberations.title,
        status: config.deliberations.status,
      } : undefined,
    })) || [];
  }

  async createAgentConfiguration(config: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent> {
    const insertData = {
      name: config.name,
      description: config.description || '',
      system_prompt: config.system_prompt || '',
      response_style: config.response_style || '',
      goals: config.goals || [],
      agent_type: config.agent_type || '',
      facilitator_config: config.facilitator_config || {},
      is_default: config.is_default || false,
      is_active: config.isActive || false
    };

    const { data, error } = await supabase
      .from('agent_configurations')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      system_prompt: data.system_prompt || '',
      response_style: data.response_style,
      goals: data.goals || [],
      agent_type: data.agent_type,
      facilitator_config: data.facilitator_config || {},
      is_default: data.is_default || false,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async updateAgentConfiguration(id: string, config: Partial<Agent>): Promise<Agent> {
    const updateData: any = {};
    
    if (config.name) updateData.name = config.name;
    if (config.description) updateData.description = config.description;
    if (config.isActive !== undefined) updateData.is_active = config.isActive;
    if (config.agent_type) updateData.agent_type = config.agent_type;
    if (config.system_prompt) updateData.system_prompt = config.system_prompt;
    if (config.goals) updateData.goals = config.goals;
    if (config.response_style) updateData.response_style = config.response_style;
    if (config.is_default !== undefined) updateData.is_default = config.is_default;

    const { data, error } = await supabase
      .from('agent_configurations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      system_prompt: data.system_prompt || '',
      response_style: data.response_style,
      goals: data.goals || [],
      agent_type: data.agent_type,
      is_default: data.is_default || false,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  // Deliberations
  async getAllDeliberations(): Promise<Deliberation[]> {
    const { data, error } = await supabase
      .from('deliberations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data?.map(deliberation => ({
      id: deliberation.id,
      title: deliberation.title,
      description: deliberation.description || '',
      status: deliberation.status,
      createdAt: deliberation.created_at,
      updatedAt: deliberation.updated_at
    })) || [];
  }

  async updateDeliberationStatus(id: string, status: string): Promise<void> {
    const { error } = await supabase
      .from('deliberations')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
  }

  // Statistics
  async getSystemStats(): Promise<AdminStats> {
    // Get total users
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // Get total deliberations
    const { count: totalDeliberations } = await supabase
      .from('deliberations')
      .select('*', { count: 'exact', head: true });

    // Get active deliberations
    const { count: activeDeliberations } = await supabase
      .from('deliberations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Get total messages
    const { count: totalMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    // Get access codes stats
    const { count: totalAccessCodes } = await supabase
      .from('access_codes')
      .select('*', { count: 'exact', head: true });

    const { count: usedAccessCodes } = await supabase
      .from('access_codes')
      .select('*', { count: 'exact', head: true })
      .eq('is_used', true);

    return {
      totalUsers: totalUsers || 0,
      totalDeliberations: totalDeliberations || 0,
      totalMessages: totalMessages || 0,
      activeDeliberations: activeDeliberations || 0,
      totalAccessCodes: totalAccessCodes || 0,
      usedAccessCodes: usedAccessCodes || 0
    };
  }
}