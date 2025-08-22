import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email, password, metadata } = await req.json();

    // Create user using admin API (won't sign them in)
    const { data: userData, error: userError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      user_metadata: metadata,
      email_confirm: true
    });

    if (userError) {
      throw userError;
    }

    // Create profile and user role
    if (userData.user) {
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .insert({
          id: userData.user.id,
          access_code_1: metadata.access_code_1,
          access_code_2: metadata.access_code_2,
          is_archived: false
        });

      if (profileError) {
        console.log('Profile creation error:', profileError);
      }

      const { error: roleError } = await supabaseClient
        .from('user_roles')
        .insert({
          user_id: userData.user.id,
          role: metadata.role
        });

      if (roleError) {
        console.log('Role creation error:', roleError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: userData.user 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error creating user:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to create user' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});