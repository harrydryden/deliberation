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

// Standardized helper function - use session for consistency
export const getCurrentUser = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user || null
}

// Helper to get session (useful for access tokens)
export const getCurrentSession = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// Note: Legacy compatibility functions have been removed - use Supabase Auth directly