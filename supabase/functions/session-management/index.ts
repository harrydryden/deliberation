import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
          return new Response(
            JSON.stringify({ error: 'Failed to create session' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Session created:', { sessionId: data.id, userId: user.id });
        return new Response(
          JSON.stringify({ session: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
          return new Response(
            JSON.stringify({ error: 'Failed to update session' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
          return new Response(
            JSON.stringify({ error: 'Failed to end session' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Session ended:', { sessionId, userId: user.id });
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
          return new Response(
            JSON.stringify({ error: 'Failed to cleanup sessions' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const cleanedCount = data?.length || 0;
        console.log('Sessions cleaned up:', { count: cleanedCount });
        
        return new Response(
          JSON.stringify({ cleanedCount }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Session management error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});