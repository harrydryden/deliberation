/**
 * Environment validation caching to reduce cold start overhead
 */

interface CachedEnvironment {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  openaiApiKey: string;
  timestamp: number;
}

let envCache: CachedEnvironment | null = null;
const CACHE_TTL = 300000; // 5 minutes

export function getCachedEnvironment() {
  // Return cached environment if valid
  if (envCache && (Date.now() - envCache.timestamp) < CACHE_TTL) {
    return {
      supabaseUrl: envCache.supabaseUrl,
      supabaseAnonKey: envCache.supabaseAnonKey,
      supabaseServiceKey: envCache.supabaseServiceKey,
      openaiApiKey: envCache.openaiApiKey
    };
  }

  // Validate and cache environment
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY'); 
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !openaiApiKey) {
    throw new Error('Missing required environment variables');
  }

  envCache = {
    supabaseUrl,
    supabaseAnonKey, 
    supabaseServiceKey,
    openaiApiKey,
    timestamp: Date.now()
  };

  return {
    supabaseUrl: envCache.supabaseUrl,
    supabaseAnonKey: envCache.supabaseAnonKey,
    supabaseServiceKey: envCache.supabaseServiceKey,
    openaiApiKey: envCache.openaiApiKey
  };
}