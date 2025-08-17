import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iowsxuxkgvpgrvvklwyt.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM'

// Create the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper function to set user context for access code authentication
export const setUserContext = async (): Promise<boolean> => {
  if (typeof localStorage === 'undefined') return false;
  
  const storedUser = localStorage.getItem('simple_auth_user');
  
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      
      if (user.id) {
        // User ID is always in access_ format now
        const userIdForContext = user.id;
        
        // Set the user context for RLS policies with retry logic
        let retries = 3;
        while (retries > 0) {
          try {
            const { data, error } = await supabase.rpc('set_config', {
              setting_name: 'app.current_user_id',
              new_value: userIdForContext,
              is_local: false
            });
            
            if (error) {
              console.error('Failed to set user context - RPC error:', error);
              retries--;
              if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
              }
              return false;
            } else {
              console.log('User context set successfully:', { userId: userIdForContext });
              return true;
            }
          } catch (error) {
            console.warn('Failed to set user context - Exception:', error);
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
              continue;
            }
            return false;
          }
        }
      }
    } catch (error) {
      console.error('Error parsing stored user:', error);
    }
  }
  return false;
};

// Enhanced function to ensure user context is properly set and verified
export const ensureUserContext = async (): Promise<boolean> => {
  // First try to set the context
  const contextSet = await setUserContext();
  if (!contextSet) return false;
  
  // Verify the context was actually set
  try {
    const { data, error } = await supabase.rpc('debug_current_user_settings');
    if (error) {
      console.error('Failed to verify user context:', error);
      return false;
    }
    
    const storedUser = localStorage.getItem('simple_auth_user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      // User ID is always in access_ format now
      const expectedUserId = user.id;
      const isContextValid = data?.config_value === expectedUserId;
      console.log('User context verification:', { 
        expected: expectedUserId, 
        actual: data?.config_value, 
        valid: isContextValid 
      });
      return isContextValid;
    }
  } catch (error) {
    console.warn('Context verification failed:', error);
  }
  
  return false;
};