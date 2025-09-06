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

    console.log('Starting session anonymization process...');

    // Call the anonymize_old_sessions function
    const { error: functionError } = await supabase.rpc('anonymize_old_sessions');
    
    if (functionError) {
      console.error('Failed to anonymize sessions:', functionError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to anonymize sessions', 
          details: functionError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Clean up expired sessions
    const { data: cleanupData, error: cleanupError } = await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .lt('expires_at', new Date().toISOString())
      .eq('is_active', true)
      .select('id');

    if (cleanupError) {
      console.error('Failed to cleanup expired sessions:', cleanupError);
    } else {
      console.log(`Cleaned up ${cleanupData?.length || 0} expired sessions`);
    }

    // Remove old audit logs (keeping only last 90 days for security purposes)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: auditCleanup, error: auditError } = await supabase
      .from('audit_logs')
      .delete()
      .lt('created_at', ninetyDaysAgo.toISOString())
      .select('id');

    if (auditError) {
      console.error('Failed to cleanup old audit logs:', auditError);
    } else {
      console.log(`Cleaned up ${auditCleanup?.length || 0} old audit logs`);
    }

    const result = {
      success: true,
      sessionsAnonymized: true,
      expiredSessionsCleaned: cleanupData?.length || 0,
      auditLogsCleaned: auditCleanup?.length || 0,
      timestamp: new Date().toISOString()
    };

    console.log('Anonymization process completed:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Session anonymization error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error during anonymization',
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
