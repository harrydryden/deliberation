import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string

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