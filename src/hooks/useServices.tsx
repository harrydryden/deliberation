// New unified hook to replace all backend service hooks
import { 
  authService, 
  messageService, 
  agentService, 
  deliberationService, 
  userService, 
  accessCodeService, 
  adminService, 
  realtimeService 
} from '@/services/domain/container';

export const useServices = () => {
  return {
    auth: authService,
    messages: messageService,
    agents: agentService,
    deliberations: deliberationService,
    users: userService,
    accessCodes: accessCodeService,
    admin: adminService,
    realtime: realtimeService,
  };
};

// Individual service hooks for convenience
export const useAuthService = () => authService;
export const useMessageService = () => messageService;
export const useAgentService = () => agentService;
export const useDeliberationService = () => deliberationService;
export const useUserService = () => userService;
export const useAccessCodeService = () => accessCodeService;
export const useAdminService = () => adminService;
export const useRealtimeService = () => realtimeService;