import { createClient } from '@supabase/supabase-js'
import { networkTracker } from '@/utils/networkTracker'

// Environment-based configuration with fallbacks for Lovable compatibility
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 
                   (typeof process !== 'undefined' ? process.env.SUPABASE_URL : null) || 
                   'https://iowsxuxkgvpgrvvklwyt.supabase.co'

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 
                       import.meta.env.VITE_SUPABASE_ANON_KEY ||
                       (typeof process !== 'undefined' ? process.env.SUPABASE_ANON_KEY : null) || 
                       'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM'

// Validate required environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing required Supabase configuration')
}

// F007 Fix: Create custom fetch that integrates with performance monitoring
const performanceTrackedFetch = (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const urlString = typeof url === 'string' ? url : url.toString()
  const method = options?.method || 'GET'
  
  // Only track Supabase API calls
  if (urlString.includes('supabase.co')) {
    const id = `supabase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    networkTracker.startRequest(id, urlString, method, 'api')
    
    return fetch(url, options).then(response => {
      const contentLength = response.headers.get('content-length')
      const size = contentLength ? parseInt(contentLength, 10) : undefined
      const errorMessage = response.ok ? undefined : response.statusText
      
      networkTracker.endRequest(id, response.status, size, errorMessage)
      return response
    }).catch(error => {
      networkTracker.endRequest(id, undefined, undefined, error.message)
      throw error
    })
  }
  
  return fetch(url, options)
}

// Create the standard Supabase client with performance tracking
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  global: {
    fetch: performanceTrackedFetch
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