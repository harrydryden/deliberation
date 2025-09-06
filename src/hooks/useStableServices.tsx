import { useMemo } from 'react';
import { serviceContainer } from '@/services/domain/container';

// Stable service provider hook that returns the same service references
export const useStableServices = () => {
  return useMemo(() => serviceContainer, []); // Empty dependency array - services are singletons
};

// Individual stable service hooks
export const useStableMessageService = () => useStableServices().messageService;
export const useStableAgentService = () => useStableServices().agentService;
export const useStableUserService = () => useStableServices().userService;
export const useStableAdminService = () => useStableServices().adminService;
export const useStableRealtimeService = () => useStableServices().realtimeService;
export const useStablePromptService = () => useStableServices().promptService;
export const useStableStanceService = () => useStableServices().stanceService;