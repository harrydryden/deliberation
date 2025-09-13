// F006 Fix: Environment caching to improve cold start performance
interface CachedEnvironment {
  supabaseUrl: string;
  supabaseServiceKey: string;
  openaiApiKey: string;
  timestamp: number;
}

let environmentCache: CachedEnvironment | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function getCachedEnvironment(): CachedEnvironment {
  const now = Date.now();
  
  // Return cached environment if valid and recent
  if (environmentCache && (now - environmentCache.timestamp) < CACHE_DURATION) {
    return environmentCache;
  }
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!openaiApiKey) missing.push('OPENAI_API_KEY');
    
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  environmentCache = {
    supabaseUrl,
    supabaseServiceKey,
    openaiApiKey,
    timestamp: now
  };
  
  return environmentCache;
}

export function invalidateEnvironmentCache(): void {
  environmentCache = null;
  }