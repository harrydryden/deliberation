import { supabase } from '@/integrations/supabase/client';

interface AccessCodeUser {
  id: string;
  accessCode?: string;
  role?: string;
}

/**
 * Gets the current authenticated user from the access code system
 * Replaces supabase.auth.getUser() calls with access code authentication
 */
export const getCurrentUser = (): AccessCodeUser | null => {
  try {
    const storedUser = localStorage.getItem('simple_auth_user');
    if (!storedUser) return null;
    
    const user = JSON.parse(storedUser);
    
    // Validate user object structure
    if (!user.id || typeof user.id !== 'string') {
      console.warn('Invalid user object in localStorage');
      return null;
    }
    
    return {
      id: user.id,
      accessCode: user.accessCode,
      role: user.role
    };
  } catch (error) {
    console.error('Error parsing stored user:', error);
    return null;
  }
};

/**
 * Sets the user context for database operations
 * Ensures RLS policies work correctly with access code authentication
 */
export const setUserContext = async (): Promise<boolean> => {
  const user = getCurrentUser();
  if (!user) return false;
  
  try {
    await supabase.rpc('set_config', {
      setting_name: 'app.current_user_id',
      new_value: user.id,
      is_local: false
    });
    return true;
  } catch (error) {
    console.error('Error setting user context:', error);
    return false;
  }
};

/**
 * Ensures user context is set before database operations
 * Should be called before any database operations that require user identification
 */
export const ensureUserContext = async (): Promise<AccessCodeUser | null> => {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  const contextSet = await setUserContext();
  if (!contextSet) {
    throw new Error('Failed to set user context');
  }
  
  return user;
};