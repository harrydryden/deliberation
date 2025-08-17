import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgentUpdateRequest {
  agentId: string;
  accessCode: string;
  updates: {
    name?: string;
    description?: string;
    agent_type?: string;
    system_prompt?: string;
    goals?: string[];
    response_style?: string;
    is_active?: boolean;
    is_default?: boolean;
    preset_questions?: any;
    facilitator_config?: any;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { agentId, accessCode, updates }: AgentUpdateRequest = await req.json();

    console.log('Admin agent operation request:', { agentId, accessCode, operation: 'update' });

    // Validate access code is admin type
    const { data: codeValidation, error: codeError } = await adminClient
      .from('access_codes')
      .select('code_type, is_active')
      .eq('code', accessCode)
      .eq('is_active', true)
      .single();

    if (codeError || !codeValidation) {
      console.error('Access code validation failed:', codeError);
      return new Response(
        JSON.stringify({ error: 'Invalid access code' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (codeValidation.code_type !== 'admin') {
      console.error('Non-admin access code used:', codeValidation.code_type);
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Perform the update operation using service role client (bypasses RLS)
    const { data, error } = await adminClient
      .from('agent_configurations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', agentId)
      .select()
      .single();

    if (error) {
      console.error('Agent update failed:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update agent configuration' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Agent updated successfully:', data.id);

    return new Response(
      JSON.stringify({ data }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Admin agent operation error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});