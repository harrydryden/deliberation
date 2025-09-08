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
      
      const response = await supabase.functions.invoke('admin-get-users', {
        method: 'GET',
        headers
      });
      
      if (response.error) throw new Error(response.error.message);
      return response.data?.users || [];
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
      await adminService.archiveUser(userId, reason);
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
    updateDeliberationStatus
  };
};