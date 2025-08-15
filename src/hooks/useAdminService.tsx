import { useServices } from '@/hooks/useServices';

export const useAdminService = () => {
  const { adminService } = useServices();
  return adminService;
};