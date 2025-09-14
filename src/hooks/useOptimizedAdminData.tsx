import { useCallback, useEffect } from 'react';
import { useOptimizedAsync } from './useOptimizedAsync';
import { serviceContainer } from '@/services/domain/container';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';
import { logger } from '@/utils/logger';
import { useDeliberationService } from './useDeliberationService';

export interface OptimizedAdminData {
  users: any[];
  deliberations: any[];
  localAgents: any[];
  agents: any[];
  stats: any;
  
  // Loading states
  loadingUsers: boolean;
  loadingDeliberations: boolean; 
  loadingLocalAgents: boolean;
  loadingAgents: boolean;
  loadingStats: boolean;

  // Actions with simplified types
  fetchUsers: () => Promise<any[]>;
  fetchDeliberations: () => Promise<any[]>;
  fetchLocalAgents: () => Promise<any[]>;
  fetchAgents: () => Promise<any[]>;
  fetchStats: () => Promise<any>;
  archiveUser: (userId: string, reason: string) => Promise<void>;
  unarchiveUser: (userId: string) => Promise<void>;
  updateDeliberationStatus: (id: string, status: string) => Promise<void>;
  createLocalAgent: (agentData: any) => Promise<void>;
  updateLocalAgent: (id: string, updates: any) => Promise<void>;
}

export const useOptimizedAdminData = (): OptimizedAdminData => {
  const { toast } = useToast();
  const adminService = serviceContainer.adminService;
  const deliberationService = useDeliberationService();

  // Simplified async operations without heavy caching
  const {
    data: users = [],
    loading: loadingUsers,
    execute: fetchUsers,
    error: usersError
  } = useOptimizedAsync(
    async () => {
      // Consistent session-based auth for admin API calls  
      const session = await supabase.auth.getSession();
      const headers = {
        'Authorization': `Bearer ${session.data.session?.access_token}`,
        'Content-Type': 'application/json'
      };
      
      try {
        const response = await supabase.functions.invoke('admin_get_users_v2', {
          body: { page: 1, limit: 50 },
          headers
        });

        // Validate edge function response and fall back on invalid data
        if (response.error || response.data?.error || !Array.isArray(response.data?.users)) {
          throw new Error(response.error?.message || response.data?.error || 'Edge function returned invalid data');
        }

        const rawUsers = response.data.users as any[];

        // Enrich with profiles and deliberations to expose access codes and participation
        const [profilesRes, participantsRes, deliberationsRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, user_role, access_code_1, access_code_2, is_archived, archived_at, archived_by, archive_reason'),
          supabase
            .from('participants')
            .select('user_id, deliberation_id, role'),
          supabase
            .from('deliberations')
            .select('id, title')
        ]);

        const profiles = profilesRes.data || [];
        const participants = participantsRes.data || [];
        const allDeliberations = deliberationsRes.data || [];

        const profileById = new Map(profiles.map((p: any) => [p.id, p]));
        const titleByDelibId = new Map(allDeliberations.map((d: any) => [d.id, d.title]));
        const delibsByUser = new Map<string, { id: string; title: string; role: string }[]>();

        participants.forEach((p: any) => {
          const list = delibsByUser.get(p.user_id) || [];
          const title = titleByDelibId.get(p.deliberation_id);
          if (title) list.push({ id: p.deliberation_id, title, role: p.role || 'participant' });
          delibsByUser.set(p.user_id, list);
        });

        return rawUsers.map((u: any) => {
          const prof = profileById.get(u.id);
          return {
            id: u.id,
            email: u.email ?? null,
            role: prof?.user_role ?? u.role ?? 'user',
            accessCode1: prof?.access_code_1 ?? null,
            accessCode2: prof?.access_code_2 ?? null,
            isArchived: prof?.is_archived ?? false,
            archivedAt: prof?.archived_at ?? null,
            archivedBy: prof?.archived_by ?? null,
            archiveReason: prof?.archive_reason ?? null,
            deliberations: delibsByUser.get(u.id) || [],
            createdAt: u.created_at ?? u.createdAt ?? null,
            lastSignInAt: u.last_sign_in_at ?? u.lastSignInAt ?? null
          };
        });
      } catch (e) {
        // Fallback: degrade gracefully to profiles list so Admin stays usable
        logger.warn('admin_get_users_v2 failed, falling back to client-side profiles fetch', e as any);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, user_role, access_code_1, access_code_2, created_at')
          .order('created_at', { ascending: false })
          .limit(2000);
        if (profilesError) {
          throw profilesError;
        }
        // Attempt to enrich with deliberations (best-effort)
        const { data: participants } = await supabase
          .from('participants')
          .select('user_id, deliberation_id, role');
        const { data: deliberations } = await supabase
          .from('deliberations')
          .select('id, title');
        const titleById = new Map((deliberations || []).map((d: any) => [d.id, d.title]));
        const delibsByUser = new Map<string, { id: string; title: string; role: string }[]>();
        (participants || []).forEach((p: any) => {
          const arr = delibsByUser.get(p.user_id) || [];
          const title = titleById.get(p.deliberation_id);
          if (title) arr.push({ id: p.deliberation_id, title, role: p.role || 'participant' });
          delibsByUser.set(p.user_id, arr);
        });
        return (profiles || []).map((p: any) => ({
          id: p.id,
          email: null,
          role: p.user_role,
          accessCode1: p.access_code_1 ?? null,
          accessCode2: p.access_code_2 ?? null,
          isArchived: p.is_archived ?? false,
          archivedAt: p.archived_at ?? null,
          archivedBy: p.archived_by ?? null,
          archiveReason: p.archive_reason ?? null,
          deliberations: delibsByUser.get(p.id) || []
        }));
      }
    }
  );

  // Handle users error in useEffect to prevent infinite re-renders
  useEffect(() => {
    if (usersError) {
      logger.error('Failed to fetch users', usersError);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive"
      });
    }
  }, [usersError, toast]);

  const {
    data: deliberations = [],
    loading: loadingDeliberations,
    execute: fetchDeliberations
  } = useOptimizedAsync(
    async () => {
      return await deliberationService.getDeliberations();
    }
  );

  const {
    data: localAgents = [],
    loading: loadingLocalAgents,
    execute: fetchLocalAgents
  } = useOptimizedAsync(
    async () => {
      return await adminService.getLocalAgents();
    }
  );

  const {
    data: agents = [],
    loading: loadingAgents,
    execute: fetchAgents
  } = useOptimizedAsync(
    async () => {
      return await adminService.getGlobalAgents();
    }
  );

  const {
    data: stats = {},
    loading: loadingStats,
    execute: fetchStats
  } = useOptimizedAsync(
    async () => {
      return await adminService.getSystemStats();
    }
  );

  // Optimized actions with error handling
  const archiveUser = useCallback(async (userId: string, reason: string) => {
    try {
      // Get current user for adminId parameter
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      await adminService.archiveUser(userId, user.id, reason);
      await fetchUsers(); // Refresh users
      toast({
        title: "Success",
        description: "User archived successfully"
      });
    } catch (error) {
      logger.error('Failed to archive user', error);
      toast({
        title: "Error",
        description: "Failed to archive user",
        variant: "destructive"
      });
    }
  }, [adminService, fetchUsers, toast]);

  const unarchiveUser = useCallback(async (userId: string) => {
    try {
      await adminService.unarchiveUser(userId);
      await fetchUsers(); // Refresh users
      toast({
        title: "Success", 
        description: "User unarchived successfully"
      });
    } catch (error) {
      logger.error('Failed to unarchive user', error);
      toast({
        title: "Error",
        description: "Failed to unarchive user",
        variant: "destructive"
      });
    }
  }, [adminService, fetchUsers, toast]);

  const updateDeliberationStatus = useCallback(async (id: string, status: string) => {
    try {
      // For now, let's use a basic status update via Supabase
      const { error } = await supabase
        .from('deliberations')
        .update({ status })
        .eq('id', id);
        
      if (error) throw error;
      await fetchDeliberations(); // Refresh deliberations
      toast({
        title: "Success",
        description: `Deliberation status updated to ${status}`
      });
    } catch (error) {
      logger.error('Failed to update deliberation status', error);
      toast({
        title: "Error", 
        description: "Failed to update deliberation status",
        variant: "destructive"
      });
    }
  }, [adminService, fetchDeliberations, toast]);

  const createLocalAgent = useCallback(async (agentData: any) => {
    try {
      // Map LocalAgentCreate to Agent format
      const agentConfig = {
        name: agentData.name,
        agent_type: agentData.agent_type,
        description: agentData.description || `${agentData.agent_type.replace('_', ' ')} for deliberation`,
        deliberation_id: agentData.deliberationId,
        is_active: true,
        is_default: false,
        goals: agentData.goals || [],
        response_style: agentData.response_style || 'conversational',
        facilitator_config: agentData.facilitator_config || {},
        prompt_overrides: {}
      };

      await serviceContainer.agentService.createAgent(agentConfig);
      await fetchLocalAgents(); // Refresh local agents
      toast({
        title: "Success",
        description: "Local agent created successfully"
      });
    } catch (error) {
      logger.error('Failed to create local agent', error);
      toast({
        title: "Error",
        description: "Failed to create local agent",
        variant: "destructive"
      });
    }
  }, [fetchLocalAgents, toast]);

  const updateLocalAgent = useCallback(async (id: string, updates: any) => {
    try {
      await serviceContainer.agentService.updateAgent(id, updates);
      await fetchLocalAgents(); // Refresh local agents
      toast({
        title: "Success",
        description: "Local agent updated successfully"
      });
    } catch (error) {
      logger.error('Failed to update local agent', error);
      toast({
        title: "Error",
        description: "Failed to update local agent",
        variant: "destructive"
      });
    }
  }, [fetchLocalAgents, toast]);

  return {
    users,
    deliberations,
    localAgents,
    agents,
    stats,
    
    loadingUsers,
    loadingDeliberations,
    loadingLocalAgents,
    loadingAgents,
    loadingStats,
    
    fetchUsers,
    fetchDeliberations,
    fetchLocalAgents,
    fetchAgents,
    fetchStats,
    archiveUser,
    unarchiveUser,
    updateDeliberationStatus,
    createLocalAgent,
    updateLocalAgent
  };
};