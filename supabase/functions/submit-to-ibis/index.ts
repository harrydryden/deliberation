import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  message_id: string;
  node_type: 'issue' | 'position' | 'argument';
  title?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create client with user's auth token for RLS
    const userSupabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Get user from the token
    const { data: { user }, error: userError } = await userSupabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { message_id, node_type = 'position', title }: RequestBody = await req.json();

    if (!message_id) {
      return new Response(
        JSON.stringify({ error: 'message_id is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Submitting message ${message_id} to IBIS for user ${user.id}`);

    // Get the message to verify ownership and get content
    const { data: message, error: messageError } = await userSupabase
      .from('messages')
      .select('*')
      .eq('id', message_id)
      .eq('user_id', user.id)
      .eq('message_type', 'user')
      .single();

    if (messageError || !message) {
      console.error('Message fetch error:', messageError);
      return new Response(
        JSON.stringify({ error: 'Message not found or access denied' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if already submitted
    if (message.submitted_to_ibis) {
      return new Response(
        JSON.stringify({ error: 'Message already submitted to IBIS' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create IBIS node
    const { data: ibisNode, error: ibisError } = await userSupabase
      .from('ibis_nodes')
      .insert({
        deliberation_id: message.deliberation_id,
        message_id: message.id,
        node_type: node_type,
        title: title || message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
        description: message.content,
        created_by: user.id
      })
      .select()
      .single();

    if (ibisError) {
      console.error('IBIS node creation error:', ibisError);
      return new Response(
        JSON.stringify({ error: 'Failed to create IBIS node' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Mark message as submitted to IBIS
    const { error: updateError } = await userSupabase
      .from('messages')
      .update({ submitted_to_ibis: true })
      .eq('id', message_id);

    if (updateError) {
      console.error('Message update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update message status' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Successfully submitted message ${message_id} to IBIS as node ${ibisNode.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        ibis_node_id: ibisNode.id,
        message: 'Message successfully submitted to IBIS'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Submit to IBIS error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});