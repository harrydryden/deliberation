import React, { createContext, useContext, ReactNode } from 'react';
import { serviceContainer } from '@/services/domain/container';

const ServiceContext = createContext(serviceContainer);

interface ServiceProviderProps {
  children: ReactNode;
}

export const ServiceProvider: React.FC<ServiceProviderProps> = ({ children }) => {
  return (
    <ServiceContext.Provider value={serviceContainer}>
      {children}
    </ServiceContext.Provider>
  );
};

export const useServices = () => {
  return useContext(ServiceContext);
};

// Individual service hooks for convenience
export const useAuthService = () => useServices().authService;
export const useMessageService = () => useServices().messageService;
export const useAgentService = () => useServices().agentService;
export const useDeliberationService = () => useServices().deliberationService;
export const useUserService = () => useServices().userService;
export const useAccessCodeService = () => useServices().accessCodeService;
export const useAdminService = () => useServices().adminService;
export const useRealtimeService = () => useServices().realtimeService;