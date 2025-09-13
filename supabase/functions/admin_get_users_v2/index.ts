import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";

// ============================================================================
// SOPHISTICATED ADMIN USER MANAGEMENT WITH SHARED FUNCTIONALITY INLINED
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
  private static readonly CIRCUIT_BREAKER_ID = 'admin_user_management';
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
// ENHANCED ADMIN USER MANAGEMENT SERVICE
// ============================================================================

class AdminUserManagementService {
  private circuitBreaker: CircuitBreaker;
  private supabase: any;

  constructor(supabase: any) {
    this.supabase = supabase;
    this.circuitBreaker = new CircuitBreaker(supabase);
  }

  async getUsers(page: number = 1, limit: number = 50, searchTerm?: string, role?: string): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using fallback user data');
      return this.generateFallbackUsers();
    }

    try {
      EdgeLogger.info('Starting admin user retrieval', {
        page,
        limit,
        searchTerm: searchTerm?.substring(0, 20),
        role
      });

      // Build query with filters
      let query = this.supabase
        .from('users')
        .select(`
          id,
          email,
          full_name,
          avatar_url,
          created_at,
          updated_at,
          last_sign_in_at,
          is_active,
          role,
          metadata
        `);

      // Apply search filter
      if (searchTerm && searchTerm.trim()) {
        query = query.or(`email.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`);
      }

      // Apply role filter
      if (role && role !== 'all') {
        query = query.eq('role', role);
      }

      // Apply pagination
      const offset = (page - 1) * limit;
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: users, error: usersError, count } = await query;

      if (usersError) {
        throw new Error(`Failed to fetch users: ${usersError.message}`);
      }

      // Get total count for pagination
      const { count: totalCount, error: countError } = await this.supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        EdgeLogger.warn('Failed to get total user count', countError);
      }

      // Get user statistics
      const stats = await this.getUserStatistics();

      const duration = Date.now() - startTime;
      EdgeLogger.info('Admin user retrieval completed successfully', {
        usersRetrieved: users?.length || 0,
        totalCount: totalCount || 0,
        page,
        limit,
        duration
      });

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      return {
        success: true,
        users: users || [],
        pagination: {
          page,
          limit,
          total: totalCount || 0,
          totalPages: Math.ceil((totalCount || 0) / limit)
        },
        statistics: stats,
        metadata: {
          processingTimeMs: duration,
          searchTerm,
          role,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('Admin user retrieval failed', {
        error: error.message,
        duration,
        page,
        limit
      });

      await this.circuitBreaker.recordFailure();
      
      return this.generateErrorResponse(error.message);
    }
  }

  private async getUserStatistics(): Promise<any> {
    try {
      const [totalUsers, activeUsers, recentUsers, roleStats] = await Promise.all([
        this.supabase
          .from('users')
          .select('*', { count: 'exact', head: true }),
        this.supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true),
        this.supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        this.supabase
          .from('users')
          .select('role')
          .not('role', 'is', null)
      ]);

      const roleCounts = (roleStats.data || []).reduce((acc: any, user: any) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {});

      return {
        totalUsers: totalUsers.count || 0,
        activeUsers: activeUsers.count || 0,
        recentUsers: recentUsers.count || 0,
        roleDistribution: roleCounts,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      EdgeLogger.warn('Failed to get user statistics', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        recentUsers: 0,
        roleDistribution: {},
        lastUpdated: new Date().toISOString()
      };
    }
  }

  private generateFallbackUsers(): any {
    EdgeLogger.info('Generating fallback user data');
    
    return {
      success: true,
      users: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0
      },
      statistics: {
        totalUsers: 0,
        activeUsers: 0,
        recentUsers: 0,
        roleDistribution: {},
        lastUpdated: new Date().toISOString()
      },
      metadata: {
        source: 'fallback',
        processingTimeMs: 0,
        reason: 'Circuit breaker open'
      }
    };
  }

  private generateErrorResponse(errorMessage: string): any {
    return {
      success: false,
      users: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0
      },
      statistics: {
        totalUsers: 0,
        activeUsers: 0,
        recentUsers: 0,
        roleDistribution: {},
        lastUpdated: new Date().toISOString()
      },
      error: errorMessage,
      metadata: {
        processingTimeMs: 0,
        reason: 'Retrieval failed'
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
  
  EdgeLogger.debug('Parsing admin user request', { requestId, requiredFields });
  
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

async function validateAndGetEnvironment() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    supabase: createClient(supabaseUrl, supabaseServiceKey)
  };
}

// ============================================================================
// INTERFACES
// ============================================================================

interface AdminUserRequest {
  page?: number;
  limit?: number;
  searchTerm?: string;
  role?: string;
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  // Track processing time for metadata
  const startTime = Date.now();

  try {
    EdgeLogger.info('Admin get users v2 function called', { 
      method: req.method, 
      url: req.url 
    });

    const { page = 1, limit = 50, searchTerm, role = 'all' }: AdminUserRequest = await parseAndValidateRequest(req, []);
    const { supabase } = await validateAndGetEnvironment();

    EdgeLogger.info('Processing admin user retrieval request', {
      page,
      limit,
      searchTerm: searchTerm?.substring(0, 20),
      role
    });

    // Create admin user management service
    const userService = new AdminUserManagementService(supabase);
    
    // Get users
    const result = await userService.getUsers(page, limit, searchTerm, role);

    EdgeLogger.info('Admin user retrieval completed', {
      success: result.success,
      usersCount: result.users?.length || 0,
      totalCount: result.pagination?.total || 0
    });

    const response = {
      ...result,
      response_format: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        processingTimeMs: Date.now() - startTime
      })
    };

    return createSuccessResponse(response);

  } catch (error) {
    EdgeLogger.error('Admin user retrieval error', error);
    
    // Add metadata to error response
    const errorResponse = createErrorResponse(error, 500, 'admin user retrieval');
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