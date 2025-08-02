import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://iowsxuxkgvpgrvvklwyt.supabase.co',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Validate request method
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Get and validate authorization header
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { fileContent, fileName, agentId, contentType } = await req.json()

    if (!fileContent || !agentId) {
      throw new Error('File content and agent ID are required')
    }

    console.log(`Processing knowledge for agent ${agentId}, file: ${fileName}`)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    // Get OpenAI API key from Supabase secrets
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (!openAIApiKey) {
      console.error('OpenAI API key not configured')
      throw new Error('Service configuration error')
    }
    
    // Validate API key format
    if (!openAIApiKey.startsWith('sk-')) {
      console.error('Invalid OpenAI API key format')
      throw new Error('Service configuration error')
    }

    // Process text content (assuming PDF text has been extracted)
    const text = fileContent

    // Split text into chunks (roughly 500 words each)
    const chunks = splitTextIntoChunks(text, 500)
    console.log(`Split text into ${chunks.length} chunks`)

    // Process each chunk
    const processedChunks = []
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      try {
        // Generate title/summary using Anthropic
        const summary = await generateChunkSummary(chunk)
        
        // Generate embeddings using OpenAI
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: chunk
          })
        })

        if (!embeddingResponse.ok) {
          throw new Error(`OpenAI API error: ${embeddingResponse.statusText}`)
        }

        const embeddingData = await embeddingResponse.json()
        const embeddingVector = embeddingData.data[0].embedding

        processedChunks.push({
          agent_id: agentId,
          title: summary,
          content: chunk,
          content_type: contentType || 'text/plain',
          file_name: fileName,
          chunk_index: i,
          embedding: embeddingVector,
          metadata: {
            chunk_length: chunk.length,
            chunk_index: i,
            total_chunks: chunks.length,
            file_name: fileName
          }
        })

        console.log(`Processed chunk ${i + 1}/${chunks.length}`)
      } catch (error) {
        console.error(`Error processing chunk ${i}:`, error)
        // Continue with other chunks
      }
    }

    // Store all chunks in the database
    if (processedChunks.length > 0) {
      const { data, error } = await supabase
        .from('agent_knowledge')
        .insert(processedChunks)
        .select()

      if (error) {
        console.error('Database error:', error)
        throw new Error(`Failed to store knowledge: ${error.message}`)
      }

      console.log(`Successfully stored ${processedChunks.length} knowledge chunks`)

      return new Response(
        JSON.stringify({ 
          success: true, 
          chunksProcessed: processedChunks.length,
          knowledgeIds: data.map(item => item.id)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } else {
      throw new Error('No chunks were successfully processed')
    }

  } catch (error) {
    console.error('Error processing agent knowledge:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

function splitTextIntoChunks(text: string, maxWords: number): string[] {
  const words = text.split(/\s+/)
  const chunks = []
  
  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords).join(' ')
    if (chunk.trim()) {
      chunks.push(chunk.trim())
    }
  }
  
  return chunks
}

async function generateChunkSummary(chunk: string): Promise<string> {
  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return `Text chunk (${chunk.substring(0, 50)}...)`
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `Generate a brief, descriptive title for this text chunk (max 10 words): ${chunk.substring(0, 200)}...`
        }]
      })
    })

    if (response.ok) {
      const data = await response.json()
      return data.content[0].text.trim()
    } else {
      console.log('Anthropic API error, using fallback title')
      return `Text chunk (${chunk.substring(0, 50)}...)`
    }
  } catch (error) {
    console.log('Error generating summary, using fallback:', error)
    return `Text chunk (${chunk.substring(0, 50)}...)`
  }
}