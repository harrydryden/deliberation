import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Import shared utilities for performance and consistency
import { 
  corsHeaders, 
  validateAndGetEnvironment, 
  createErrorResponse, 
  createSuccessResponse,
  handleCORSPreflight,
  parseAndValidateRequest
} from '../shared/edge-function-utils.ts';

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createErrorResponse('No authorization header', 401);
    }

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return createErrorResponse('Invalid authentication', 401);
    }

    const { action, sessionData } = await req.json();

    switch (action) {
      case 'create': {
        const { sessionTokenHash } = sessionData;
        
        // End any existing active sessions for this user
        await supabase
          .from('user_sessions')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .eq('is_active', true);

        // Create new session with minimal tracking for anonymity
        const { data, error } = await supabase
          .from('user_sessions')
          .insert({
            user_id: user.id,
            session_token_hash: sessionTokenHash,
            is_active: true
          })
          .select()
          .single();

        if (error) {
          console.error('Session creation error:', error);
          return createErrorResponse('Failed to create session', 500);
        }

        console.log('Session created:', { sessionId: data.id, userId: user.id });
        return createSuccessResponse({ session: data });
      }

      case 'update': {
        const { sessionId } = sessionData;
        
        const { error } = await supabase
          .from('user_sessions')
          .update({ 
            last_active: new Date().toISOString() 
          })
          .eq('id', sessionId)
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (error) {
          console.error('Session update error:', error);
          return createErrorResponse('Failed to update session', 500);
        }

        return createSuccessResponse({ success: true });
      }

      case 'end': {
        const { sessionId } = sessionData;
        
        const { error } = await supabase
          .from('user_sessions')
          .update({ 
            is_active: false,
            last_active: new Date().toISOString()
          })
          .eq('id', sessionId)
          .eq('user_id', user.id);

        if (error) {
          console.error('Session end error:', error);
          return createErrorResponse('Failed to end session', 500);
        }

        console.log('Session ended:', { sessionId, userId: user.id });
        return createSuccessResponse({ success: true });
      }

      case 'cleanup': {
        // Cleanup expired sessions
        const { data, error } = await supabase
          .from('user_sessions')
          .update({ is_active: false })
          .lt('expires_at', new Date().toISOString())
          .eq('is_active', true)
          .select('id');

        if (error) {
          console.error('Session cleanup error:', error);
          return createErrorResponse('Failed to cleanup sessions', 500);
        }

        const cleanedCount = data?.length || 0;
        console.log('Sessions cleaned up:', { count: cleanedCount });
        
        return createSuccessResponse({ cleanedCount });
      }

      default:
        return createErrorResponse('Invalid action', 400);
    }
  } catch (error) {
    console.error('Session management error:', error);
    return createErrorResponse(error, 500, 'session-management');
  }
});