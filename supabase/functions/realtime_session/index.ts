import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";

// ============================================================================
// SOPHISTICATED REALTIME SESSION MANAGEMENT WITH SHARED FUNCTIONALITY INLINED
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, cache-control, x-requested-with',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

// ============================================================================
// ENHANCED EDGE LOGGER
// ============================================================================

class EdgeLogger {
  private static formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] ${message}${dataStr}`;
  }

  static debug(message: string, data?: any): void {
    );
  }

  static info(message: string, data?: any): void {
    );
  }

  static warn(message: string, data?: any): void {
    );
  }

  static error(message: string, data?: any): void {
    );
  }
}

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

class CircuitBreaker {
  private static readonly CIRCUIT_BREAKER_ID = 'realtime_session';
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private static readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

  constructor(private supabase: any) {}

  async isOpen(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('circuit_breaker_state')
        .select('*')
        .eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID)
        .maybeSingle();

      if (error || !data) return false;

      const now = Date.now();
      const lastFailureTime = new Date(data.last_failure_time).getTime();
      
      if (data.failure_count >= CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD) {
        const timeSinceLastFailure = now - lastFailureTime;
        
        if (timeSinceLastFailure < CircuitBreaker.CIRCUIT_BREAKER_TIMEOUT) {
          EdgeLogger.warn(`Circuit breaker OPEN - ${Math.ceil((CircuitBreaker.CIRCUIT_BREAKER_TIMEOUT - timeSinceLastFailure) / 1000)}s remaining`);
          return true;
        } else {
          await this.reset();
          return false;
        }
      }
      
      return false;
    } catch (error) {
      EdgeLogger.warn('Circuit breaker check failed, assuming closed', error);
      return false;
    }
  }

  async recordFailure(): Promise<void> {
    try {
      const now = new Date();
      const { data: currentState } = await this.supabase
        .from('circuit_breaker_state')
        .select('failure_count')
        .eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID)
        .maybeSingle();

      const newFailureCount = (currentState?.failure_count || 0) + 1;
      
      await this.supabase
        .from('circuit_breaker_state')
        .upsert({
          id: CircuitBreaker.CIRCUIT_BREAKER_ID,
          failure_count: newFailureCount,
          last_failure_time: now,
          is_open: newFailureCount >= CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD,
          updated_at: now
        }, { onConflict: 'id' });

      EdgeLogger.info(`Circuit breaker failure recorded: ${newFailureCount}/${CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD}`);
    } catch (error) {
      EdgeLogger.error('Failed to record circuit breaker failure', error);
    }
  }

  async reset(): Promise<void> {
    try {
      await this.supabase
        .from('circuit_breaker_state')
        .update({
          failure_count: 0,
          is_open: false,
          updated_at: new Date()
        })
        .eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID);
      EdgeLogger.info('Circuit breaker RESET');
    } catch (error) {
      EdgeLogger.error('Failed to reset circuit breaker', error);
    }
  }
}

// ============================================================================
// ENHANCED REALTIME SESSION SERVICE
// ============================================================================

class RealtimeSessionService {
  private circuitBreaker: CircuitBreaker;
  private supabase: any;
  private openaiApiKey: string;

  constructor(supabase: any, openaiApiKey: string) {
    this.supabase = supabase;
    this.openaiApiKey = openaiApiKey;
    this.circuitBreaker = new CircuitBreaker(supabase);
  }

  async manageSession(
    action: string,
    sessionId?: string,
    deliberationId?: string,
    userId?: string,
    metadata?: any
  ): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using fallback session management');
      return this.generateFallbackSession(action);
    }

    try {
      EdgeLogger.info('Starting realtime session management', {
        action,
        sessionId,
        deliberationId,
        userId: userId?.substring(0, 8)
      });

      switch (action) {
        case 'create':
          return await this.createSession(deliberationId, userId, metadata);
        case 'join':
          return await this.joinSession(sessionId, userId, metadata);
        case 'leave':
          return await this.leaveSession(sessionId, userId);
        case 'get':
          return await this.getSession(sessionId);
        case 'list':
          return await this.listSessions(deliberationId);
        case 'update':
          return await this.updateSession(sessionId, metadata);
        case 'delete':
          return await this.deleteSession(sessionId);
        default:
          throw new Error(`Unknown action: ${action}`);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('Realtime session management failed', {
        error: error.message,
        duration,
        action,
        sessionId
      });

      await this.circuitBreaker.recordFailure();
      
      return this.generateErrorResponse(error.message, action);
    }
  }

  private async createSession(deliberationId: string, userId: string, metadata?: any): Promise<any> {
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { data: session, error } = await this.supabase
      .from('realtime_sessions')
      .insert({
        id: sessionId,
        deliberation_id: deliberationId,
        created_by: userId,
        status: 'active',
        metadata: metadata || {},
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }

    EdgeLogger.info('Realtime session created', {
      sessionId,
      deliberationId,
      userId: userId.substring(0, 8)
    });

    return {
      success: true,
      action: 'create',
      session,
      metadata: {
        processingTimeMs: Date.now() - Date.now(),
        timestamp: now
      }
    };
  }

  private async joinSession(sessionId: string, userId: string, metadata?: any): Promise<any> {
    const now = new Date().toISOString();

    // Check if session exists and is active
    const { data: session, error: sessionError } = await this.supabase
      .from('realtime_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('status', 'active')
      .single();

    if (sessionError || !session) {
      throw new Error('Session not found or not active');
    }

    // Add user to session participants
    const { error: joinError } = await this.supabase
      .from('session_participants')
      .upsert({
        session_id: sessionId,
        user_id: userId,
        joined_at: now,
        metadata: metadata || {}
      }, { onConflict: 'session_id,user_id' });

    if (joinError) {
      throw new Error(`Failed to join session: ${joinError.message}`);
    }

    EdgeLogger.info('User joined realtime session', {
      sessionId,
      userId: userId.substring(0, 8)
    });

    return {
      success: true,
      action: 'join',
      session,
      metadata: {
        processingTimeMs: Date.now() - Date.now(),
        timestamp: now
      }
    };
  }

  private async leaveSession(sessionId: string, userId: string): Promise<any> {
    const now = new Date().toISOString();

    const { error } = await this.supabase
      .from('session_participants')
      .update({
        left_at: now,
        status: 'left'
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to leave session: ${error.message}`);
    }

    EdgeLogger.info('User left realtime session', {
      sessionId,
      userId: userId.substring(0, 8)
    });

    return {
      success: true,
      action: 'leave',
      metadata: {
        processingTimeMs: Date.now() - Date.now(),
        timestamp: now
      }
    };
  }

  private async getSession(sessionId: string): Promise<any> {
    const { data: session, error } = await this.supabase
      .from('realtime_sessions')
      .select(`
        *,
        participants:session_participants(
          user_id,
          joined_at,
          left_at,
          status,
          metadata
        )
      `)
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      throw new Error('Session not found');
    }

    EdgeLogger.debug('Realtime session retrieved', {
      sessionId,
      participantsCount: session.participants?.length || 0
    });

    return {
      success: true,
      action: 'get',
      session,
      metadata: {
        processingTimeMs: Date.now() - Date.now(),
        timestamp: new Date().toISOString()
      }
    };
  }

  private async listSessions(deliberationId?: string): Promise<any> {
    let query = this.supabase
      .from('realtime_sessions')
      .select(`
        *,
        participants:session_participants(
          user_id,
          joined_at,
          status
        )
      `)
      .order('created_at', { ascending: false });

    if (deliberationId) {
      query = query.eq('deliberation_id', deliberationId);
    }

    const { data: sessions, error } = await query;

    if (error) {
      throw new Error(`Failed to list sessions: ${error.message}`);
    }

    EdgeLogger.debug('Realtime sessions listed', {
      count: sessions?.length || 0,
      deliberationId
    });

    return {
      success: true,
      action: 'list',
      sessions: sessions || [],
      metadata: {
        processingTimeMs: Date.now() - Date.now(),
        timestamp: new Date().toISOString()
      }
    };
  }

  private async updateSession(sessionId: string, metadata: any): Promise<any> {
    const now = new Date().toISOString();

    const { data: session, error } = await this.supabase
      .from('realtime_sessions')
      .update({
        metadata,
        updated_at: now
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update session: ${error.message}`);
    }

    EdgeLogger.info('Realtime session updated', {
      sessionId
    });

    return {
      success: true,
      action: 'update',
      session,
      metadata: {
        processingTimeMs: Date.now() - Date.now(),
        timestamp: now
      }
    };
  }

  private async deleteSession(sessionId: string): Promise<any> {
    const now = new Date().toISOString();

    const { error } = await this.supabase
      .from('realtime_sessions')
      .update({
        status: 'deleted',
        updated_at: now
      })
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to delete session: ${error.message}`);
    }

    EdgeLogger.info('Realtime session deleted', {
      sessionId
    });

    return {
      success: true,
      action: 'delete',
      metadata: {
        processingTimeMs: Date.now() - Date.now(),
        timestamp: now
      }
    };
  }

  private generateFallbackSession(action: string): any {
    EdgeLogger.info('Generating fallback session response', { action });
    
    return {
      success: true,
      action,
      session: null,
      metadata: {
        source: 'fallback',
        processingTimeMs: 0,
        reason: 'Circuit breaker open'
      }
    };
  }

  private generateErrorResponse(errorMessage: string, action: string): any {
    return {
      success: false,
      action,
      session: null,
      error: errorMessage,
      metadata: {
        processingTimeMs: 0,
        reason: 'Session management failed'
      }
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function handleCORSPreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

function createErrorResponse(error: any, status: number = 500, context?: string): Response {
  const errorId = crypto.randomUUID();
  EdgeLogger.error(`${context || 'Edge Function'} Error`, { errorId, error: error?.message });
  
  return new Response(
    JSON.stringify({
      error: error?.message || 'An unexpected error occurred',
      errorId,
      context,
      timestamp: new Date().toISOString()
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

function createSuccessResponse(data: any): Response {
  return new Response(
    JSON.stringify(data),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

async function parseAndValidateRequest<T>(request: Request, requiredFields: string[] = []): Promise<T> {
  const requestId = crypto.randomUUID().slice(0, 8);
  
  EdgeLogger.debug('Parsing realtime session request', { requestId, requiredFields });
  
  try {
    const body = await request.json();
    
    for (const field of requiredFields) {
      if (!(field in body) || body[field] === null || body[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    EdgeLogger.debug('Request validation successful', { requestId });
    return body as T;
  } catch (error: any) {
    EdgeLogger.error('Request parsing failed', { requestId, error: error.message });
    throw new Error(`Request parsing failed: ${error.message}`);
  }
}

function getOpenAIKey(): string {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }
  return apiKey;
}

async function validateAndGetEnvironment() {
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

  return {
    supabase: createClient(supabaseUrl, supabaseServiceKey),
    openaiApiKey
  };
}

// ============================================================================
// INTERFACES
// ============================================================================

interface RealtimeSessionRequest {
  action: string;
  sessionId?: string;
  deliberationId?: string;
  userId?: string;
  metadata?: any;
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    EdgeLogger.info('Realtime session function called', { 
      method: req.method, 
      url: req.url 
    });

    const { action, sessionId, deliberationId, userId, metadata }: RealtimeSessionRequest = await parseAndValidateRequest(req, ['action']);
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();

    EdgeLogger.info('Processing realtime session request', {
      action,
      sessionId,
      deliberationId,
      userId: userId?.substring(0, 8)
    });

    // Create realtime session service
    const sessionService = new RealtimeSessionService(supabase, openaiApiKey);
    
    // Manage session
    const result = await sessionService.manageSession(action, sessionId, deliberationId, userId, metadata);

    EdgeLogger.info('Realtime session management completed', {
      success: result.success,
      action: result.action
    });

    return createSuccessResponse({
      ...result,
      response_format: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        processingTimeMs: Date.now() - startTime
      })
    });

  } catch (error) {
    EdgeLogger.error('Service error', error);
    
    // Add metadata to error response
    const errorResponse = createErrorResponse(error, 500, 'service');
    const errorData = await errorResponse.json();
    
    return createSuccessResponse({
      ...errorData,
      response_format: JSON.stringify({
        success: false,
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        processingTimeMs: Date.now() - startTime,
        error: error.message
      })
    });
  }
});
