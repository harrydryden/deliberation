// Environment-based Supabase configuration with fallbacks
export const SUPABASE_CONFIG = {
  url: import.meta.env.VITE_SUPABASE_URL || 
       (typeof process !== 'undefined' ? process.env.SUPABASE_URL : null) || 
       'https://iowsxuxkgvpgrvvklwyt.supabase.co',
  anonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 
           import.meta.env.VITE_SUPABASE_ANON_KEY ||
           (typeof process !== 'undefined' ? process.env.SUPABASE_ANON_KEY : null) || 
           'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM',
} as const;

export type DatabaseTables = 'users' | 'messages' | 'deliberations' | 'agent_configurations' | 'profiles';