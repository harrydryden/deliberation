import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iowsxuxkgvpgrvvklwyt.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM'

// Create the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper function to set user context for access code authentication
export const setUserContext = async (): Promise<void> => {
  if (typeof localStorage === 'undefined') return;
  
  const storedUser = localStorage.getItem('simple_auth_user');
  console.log('StoredUser from localStorage:', storedUser);
  
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      console.log('Parsed user:', user);
      console.log('User ID extracted:', user.id);
      
      if (user.id) {
        // Set the user context for RLS policies
        try {
          await supabase.rpc('set_config', {
            setting_name: 'app.current_user_id',
            new_value: user.id,
            is_local: false
          });
        } catch (error) {
          console.warn('Failed to set user context:', error);
        }
      }
    } catch (error) {
      console.error('Error parsing stored user:', error);
    }
  }
};