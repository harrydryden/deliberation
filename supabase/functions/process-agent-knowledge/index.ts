import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('=== EDGE FUNCTION CALLED ===')
  console.log('Method:', req.method)
  
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      console.log('Returning CORS response')
      return new Response('ok', { headers: corsHeaders })
    }

    console.log('Processing POST request...')
    
    // Parse request body
    const body = await req.json()
    console.log('Agent ID:', body.agentId)
    console.log('File name:', body.fileName)
    console.log('Content type:', body.contentType)
    console.log('Content length:', body.fileContent?.length)

    const { fileContent, fileName, agentId, contentType } = body

    // Check required fields
    if (!fileContent || !agentId) {
      console.log('Missing required fields')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing fileContent or agentId' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

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

    // Get OpenAI API key
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (!openAIApiKey) {
      console.error('OpenAI API key not configured')
      throw new Error('Service configuration error')
    }

    console.log('Processing file content...')
    
    // Extract text content based on file type
    let textContent = ''
    
    if (contentType === 'application/pdf') {
      // For PDF files, assume the frontend has already extracted the text content
      // The fileContent should be the base64 encoded PDF or extracted text
      if (typeof fileContent === 'string' && !fileContent.startsWith('data:')) {
        // If it's not a data URL, treat it as extracted text
        textContent = fileContent
      } else {
        // For now, we'll handle PDFs by asking the frontend to send extracted text
        throw new Error('PDF processing requires text extraction on the frontend')
      }
    } else if (contentType === 'text/plain' || contentType === 'text/markdown') {
      textContent = fileContent
    } else {
      throw new Error(`Unsupported content type: ${contentType}`)
    }

    if (!textContent || textContent.trim().length === 0) {
      throw new Error('No text content extracted from file')
    }

    console.log(`Extracted text content length: ${textContent.length}`)

    // Chunk the text content (split into smaller pieces for better embeddings)
    const chunks = chunkText(textContent, 1000, 200) // 1000 chars with 200 char overlap
    console.log(`Created ${chunks.length} text chunks`)

    let processedChunks = 0
    
    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      if (chunk.trim().length < 50) {
        console.log(`Skipping small chunk ${i + 1}`)
        continue // Skip very small chunks
      }

      console.log(`Processing chunk ${i + 1}/${chunks.length}`)
      
      // Generate embedding using OpenAI
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
        console.error(`OpenAI API error for chunk ${i + 1}:`, embeddingResponse.statusText)
        continue // Skip this chunk but continue with others
      }

      const embeddingData = await embeddingResponse.json()
      const embeddingVector = embeddingData.data[0].embedding

      // Create a title for this chunk
      const chunkTitle = `${fileName || 'Document'} - Part ${i + 1}`
      
      // Insert into agent_knowledge table
      const { error: insertError } = await supabase
        .from('agent_knowledge')
        .insert({
          agent_id: agentId,
          title: chunkTitle,
          content: chunk,
          content_type: contentType,
          file_name: fileName,
          chunk_index: i,
          file_size: textContent.length,
          embedding: embeddingVector,
          metadata: {
            total_chunks: chunks.length,
            chunk_size: chunk.length,
            original_file_type: contentType
          }
        })

      if (insertError) {
        console.error(`Error inserting chunk ${i + 1}:`, insertError)
        continue // Skip this chunk but continue with others
      }

      processedChunks++
      console.log(`Successfully processed chunk ${i + 1}`)
    }

    console.log(`Processing complete. ${processedChunks} chunks processed successfully.`)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        chunksProcessed: processedChunks,
        totalChunks: chunks.length,
        message: `Successfully processed ${processedChunks} knowledge chunks`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('=== ERROR IN EDGE FUNCTION ===')
    console.error('Error type:', typeof error)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Edge function error: ${error.message}`,
        details: error.stack
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

// Helper function to chunk text into smaller pieces with overlap
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + chunkSize
    
    // If this isn't the last chunk, try to break at a sentence or word boundary
    if (end < text.length) {
      // Look for sentence boundaries first
      const sentenceEnd = text.lastIndexOf('.', end)
      const questionEnd = text.lastIndexOf('?', end)
      const exclamationEnd = text.lastIndexOf('!', end)
      
      const sentenceBoundary = Math.max(sentenceEnd, questionEnd, exclamationEnd)
      
      if (sentenceBoundary > start + chunkSize * 0.7) {
        end = sentenceBoundary + 1
      } else {
        // Fall back to word boundary
        const wordBoundary = text.lastIndexOf(' ', end)
        if (wordBoundary > start + chunkSize * 0.7) {
          end = wordBoundary
        }
      }
    }

    const chunk = text.slice(start, end).trim()
    if (chunk.length > 0) {
      chunks.push(chunk)
    }

    // Move start position with overlap consideration
    start = end - overlap
    if (start >= text.length) break
  }

  return chunks
}