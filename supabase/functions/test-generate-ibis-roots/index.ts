import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    console.log('=== Test Function Started ===');
    
    // Test 1: Read request body
    const rawBody = await req.text();
    console.log('✅ Request body received:', rawBody.length, 'characters');
    
    let requestData;
    try {
      requestData = JSON.parse(rawBody);
      console.log('✅ JSON parsed successfully');
      console.log('✅ Data keys:', Object.keys(requestData));
    } catch (parseError) {
      console.error('❌ JSON parse failed:', parseError);
      return new Response(JSON.stringify({ error: 'JSON parse failed', details: parseError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Test 2: Check environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    
    console.log('✅ Environment check:');
    console.log('- SUPABASE_URL:', !!supabaseUrl);
    console.log('- SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
    console.log('- OPENAI_API_KEY:', !!openaiKey);
    
    if (!openaiKey) {
      console.error('❌ OPENAI_API_KEY is missing');
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not found' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Test 3: Simple OpenAI API call
    console.log('Testing OpenAI API call...');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini-2025-08-07',
        max_completion_tokens: 100,
        messages: [
          {
            role: 'user',
            content: 'Say "Hello, test successful!"'
          }
        ]
      })
    });
    
    console.log('OpenAI response status:', openaiResponse.status);
    
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('❌ OpenAI API error:', errorText);
      return new Response(JSON.stringify({ error: 'OpenAI API failed', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const openaiData = await openaiResponse.json();
    console.log('✅ OpenAI API call successful');
    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'All tests passed',
      openaiResponse: openaiData.choices[0].message.content
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Test function error:', error);
    return new Response(JSON.stringify({ 
      error: 'Test function failed', 
      details: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});