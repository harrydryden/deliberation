import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';

/**
 * Utility function to create a standardized auth helper for service classes.
 * This helps services that can't use hooks directly to get user info consistently.
 * 
 * Usage in service:
 * const authHelper = createAuthHelper();
 * const userId = authHelper.getCurrentUserId();
 */
export const createAuthHelper = () => {
  // This is intended to be used in contexts where hooks aren't available
  // For components and hooks, use useSupabaseAuth directly
  
  return {
    getCurrentUserId: () => {
      // This is a placeholder - in practice, services should receive
      // userId as parameters from components that use useSupabaseAuth
      throw new Error('Use useSupabaseAuth hook in components and pass userId to services');
    }
  };
};

/**
 * Type for standardized auth information passed to services
 */
export interface AuthInfo {
  userId: string;
  isAdmin: boolean;
}

/**
 * Helper to extract auth info from useSupabaseAuth hook
 * Use this in components to prepare auth data for services
 */
export const getAuthInfo = (user: any, isAdmin: boolean): AuthInfo | null => {
  if (!user?.id) return null;
  
  return {
    userId: user.id,
    isAdmin
  };
};