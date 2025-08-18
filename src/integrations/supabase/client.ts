import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iowsxuxkgvpgrvvklwyt.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM'

// Function to get current access code from localStorage
const getCurrentAccessCode = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  
  try {
    const storedUser = localStorage.getItem('simple_auth_user');
    if (!storedUser) return null;
    const user = JSON.parse(storedUser);
    return user?.accessCode || null;
  } catch (error) {
    console.warn('Error getting access code:', error);
    return null;
  }
};

// Create the Supabase client with dynamic access code headers
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {},
  }
})

// Function to ensure access code header is set before any request
const ensureAccessCodeHeader = () => {
  const accessCode = getCurrentAccessCode()
  console.log('🔧 Setting access code header:', accessCode ? 'PRESENT' : 'MISSING')
  if (accessCode) {
    // Set the header dynamically for each request
    (supabase as any).rest.headers = {
      ...(supabase as any).rest.headers,
      'x-access-code': accessCode
    }
    console.log('✅ Access code header set for request')
  } else {
    console.warn('❌ No access code available for header')
  }
}

// Wrap key Supabase methods to inject headers
const originalFrom = supabase.from.bind(supabase)
supabase.from = function(table: string) {
  ensureAccessCodeHeader()
  return originalFrom(table)
}

const originalRpc = supabase.rpc.bind(supabase)
supabase.rpc = function(fn: string, args?: any, options?: any) {
  ensureAccessCodeHeader()
  return originalRpc(fn, args, options)
}

// Simple helper function to get current user (no context setting needed)
export const getCurrentUser = () => {
  if (typeof localStorage === 'undefined') return null;
  
  try {
    const storedUser = localStorage.getItem('simple_auth_user');
    if (!storedUser) return null;
    return JSON.parse(storedUser);
  } catch (error) {
    console.warn('Error getting current user:', error);
    return null;
  }
};

// Legacy compatibility (these functions are no longer needed but kept for compatibility)
export const setUserContext = async (): Promise<boolean> => {
  // With header-based auth, context setting is automatic
  console.warn('setUserContext is deprecated - using header-based authentication');
  return true;
};

export const ensureUserContext = async (): Promise<boolean> => {
  // With header-based auth, context setting is automatic
  console.warn('ensureUserContext is deprecated - using header-based authentication');
  return true;
};