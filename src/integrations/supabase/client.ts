import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iowsxuxkgvpgrvvklwyt.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM'

// Create the standard Supabase client for Supabase Auth
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Simple helper function to get current user from Supabase Auth session
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Legacy compatibility functions (deprecated - these are no longer needed)
export const setUserContext = async (): Promise<boolean> => {
  console.warn('setUserContext is deprecated - using Supabase Auth');
  return true;
};

export const ensureUserContext = async (): Promise<boolean> => {
  console.warn('ensureUserContext is deprecated - using Supabase Auth');
  return true;
};