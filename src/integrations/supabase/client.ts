import { createClient } from '@supabase/supabase-js'
import { networkTracker } from '@/utils/networkTracker'
import { getSupabaseUrl, getSupabaseAnonKey } from '@/config/environment'

// Get validated configuration
const supabaseUrl = getSupabaseUrl()
const supabaseAnonKey = getSupabaseAnonKey()

// F007 Fix: Create custom fetch that integrates with performance monitoring
const performanceTrackedFetch = (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const urlString = typeof url === 'string' ? url : url.toString()
  const method = options?.method || 'GET'
  
  // Only track Supabase API calls (using domain detection)
  if (urlString.includes('.supabase.co') || urlString.includes('supabase')) {
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