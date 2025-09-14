import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/use-toast';
import { useServices } from '@/hooks/useServices';

export const useAdminService = () => {
  const { adminService } = useServices();
  const { toast } = useToast();
  return adminService;
};