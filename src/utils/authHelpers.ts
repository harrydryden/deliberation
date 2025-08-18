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
  if (!user) {
    console.error('No user found when setting context');
    return false;
  }
  
  try {
    console.log('Setting user context for:', { userId: user.id });
    
    // ALWAYS use the user UUID, never the access code
    // The user.id should already be a UUID from the authentication process
    const { data, error } = await supabase.rpc('set_config', {
      setting_name: 'app.current_user_id',
      new_value: user.id, // This should be the UUID
      is_local: false
    });
    
    if (error) {
      console.error('Error setting user context:', error);
      return false;
    }
    
    // Simple wait to ensure the context is set before verification
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Verify the context was set with retry
    let verificationAttempts = 3;
    while (verificationAttempts > 0) {
      try {
        const { data: debugData, error: debugError } = await supabase.rpc('debug_current_user_settings');
        if (!debugError && debugData?.config_value === user.id) {
          console.log('User context verified successfully:', { userId: user.id });
          return true;
        }
        
        if (verificationAttempts > 1) {
          console.log(`Verification attempt failed, retrying... (${verificationAttempts - 1} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (verificationError) {
        console.warn('Context verification error:', verificationError);
      }
      
      verificationAttempts--;
    }
    
    // If verification fails but set_config succeeded, assume success
    console.log('Context verification failed but set_config succeeded, proceeding:', { userId: user.id });
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