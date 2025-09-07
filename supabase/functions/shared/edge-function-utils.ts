// Shared utilities for edge functions - eliminates code duplication and improves performance
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

// Standard CORS headers for all functions
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment validation cache to avoid repeated checks
let envValidationCache: { valid: boolean; clients?: any; timestamp: number } | null = null;
const ENV_CACHE_DURATION = 60 * 1000; // 1 minute cache

export interface EdgeFunctionClients {
  supabase: any;
  userSupabase: any;
}

// Optimized environment validation with caching
export function validateAndGetEnvironment(): EdgeFunctionClients {
  const now = Date.now();
  
  // Return cached result if valid and recent
  if (envValidationCache && 
      envValidationCache.valid && 
      (now - envValidationCache.timestamp) < ENV_CACHE_DURATION) {
    return envValidationCache.clients!;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
    
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const clients = {
    supabase: createClient(supabaseUrl, supabaseServiceKey),
    userSupabase: createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    })
  };

  // Cache the result
  envValidationCache = {
    valid: true,
    clients,
    timestamp: now
  };

  return clients;
}

// Enhanced error response helper with consistent formatting
export function createErrorResponse(
  error: any, 
  status: number = 500, 
  context?: string
): Response {
  const errorMessage = error?.message || 'An unexpected error occurred';
  const errorId = crypto.randomUUID().slice(0, 8);
  
  console.error(`[${errorId}] Edge function error${context ? ` in ${context}` : ''}:`, error);
  
  return new Response(
    JSON.stringify({ 
      error: errorMessage,
      errorId,
      context: context || 'unknown',
      timestamp: new Date().toISOString()
    }),
    { 
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

// Success response helper
export function createSuccessResponse(data: any): Response {
  return new Response(
    JSON.stringify(data),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

// CORS preflight handler
export function handleCORSPreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

// OpenAI API key validation with caching
let openAIKeyCache: { key: string; timestamp: number } | null = null;
const OPENAI_KEY_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function getOpenAIKey(): string {
  const now = Date.now();
  
  // Return cached key if valid and recent
  if (openAIKeyCache && (now - openAIKeyCache.timestamp) < OPENAI_KEY_CACHE_DURATION) {
    return openAIKeyCache.key;
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  // Cache the key
  openAIKeyCache = { key: apiKey, timestamp: now };
  return apiKey;
}

// Request validation helper
export async function parseAndValidateRequest<T>(
  request: Request,
  requiredFields: string[] = []
): Promise<T> {
  let body: any;
  
  try {
    body = await request.json();
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }

  // Validate required fields
  const missing = requiredFields.filter(field => !(field in body));
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  return body as T;
}

// Optimized streaming response handler
export function createStreamingResponse(): {
  sendData: (data: any) => void;
  stream: ReadableStream;
} {
  let controller: ReadableStreamDefaultController;
  
  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
    }
  });

  const sendData = (data: any) => {
    try {
      const chunk = `data: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(new TextEncoder().encode(chunk));
      
      if (data.done) {
        controller.close();
      }
    } catch (error) {
      console.error('Streaming error:', error);
      controller.error(error);
    }
  };

  return { sendData, stream };
}

// Memory cleanup utility for edge functions
export function scheduleCleanup(cleanupFn: () => void, delayMs: number = 1000): void {
  setTimeout(() => {
    try {
      cleanupFn();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }, delayMs);
}