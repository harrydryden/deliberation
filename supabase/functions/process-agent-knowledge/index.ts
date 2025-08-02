import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  console.log('Edge function called with method:', req.method)
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight')
    return new Response(null, { headers: corsHeaders })
  }

  // Validate request method
  if (req.method !== 'POST') {
    console.log('Invalid method:', req.method)
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    console.log('Starting to process request...')
    
    // Get and validate authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Missing or invalid authorization header')
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { fileContent, fileName, agentId, contentType } = await req.json()
    console.log('Request body parsed:', { fileName, agentId, contentType, contentLength: fileContent?.length })

    if (!fileContent || !agentId) {
      throw new Error('File content and agent ID are required')
    }

    console.log(`Processing knowledge for agent ${agentId}, file: ${fileName}, type: ${contentType}`)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration')
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
      throw new Error('Service configuration error - OpenAI API key missing')
    }
    
    // Validate API key format
    if (!openAIApiKey.startsWith('sk-')) {
      console.error('Invalid OpenAI API key format')
      throw new Error('Service configuration error - Invalid API key format')
    }

    // Extract text based on content type
    let text = ''
    if (contentType === 'application/pdf') {
      console.log('Extracting text from PDF...')
      try {
        text = await extractTextFromPDF(fileContent)
        console.log(`PDF text extraction successful, ${text.length} characters`)
      } catch (pdfError) {
        console.error('PDF extraction failed:', pdfError)
        // For now, if PDF extraction fails, return a helpful error
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `PDF text extraction failed: ${pdfError.message}. Please try converting the PDF to a text file first.` 
          }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    } else {
      text = fileContent
    }

    if (!text || text.trim().length === 0) {
      throw new Error('No text content found to process')
    }

    // Split text into chunks (roughly 500 words each)
    const chunks = splitTextIntoChunks(text, 500)
    console.log(`Split text into ${chunks.length} chunks`)

    // Process each chunk
    const processedChunks = []
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      try {
        console.log(`Processing chunk ${i + 1}/${chunks.length}`)
        
        // Generate title/summary using Anthropic (with fallback)
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
          const errorText = await embeddingResponse.text()
          console.error('OpenAI API error:', errorText)
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

        console.log(`Successfully processed chunk ${i + 1}/${chunks.length}`)
      } catch (error) {
        console.error(`Error processing chunk ${i}:`, error)
        // Continue with other chunks but log the error
      }
    }

    // Store all chunks in the database
    if (processedChunks.length > 0) {
      console.log(`Storing ${processedChunks.length} processed chunks...`)
      
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

async function extractTextFromPDF(base64Data: string): Promise<string> {
  console.log('Starting PDF text extraction...')
  
  // Convert base64 to Uint8Array
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  console.log(`PDF file size: ${bytes.length} bytes`)

  // Use a simple PDF text extraction approach
  const pdfText = await extractSimplePDFText(bytes)
  
  if (!pdfText.trim()) {
    throw new Error('No text could be extracted from the PDF. The PDF might be image-based, encrypted, or in an unsupported format.')
  }
  
  console.log(`Successfully extracted ${pdfText.length} characters from PDF`)
  return pdfText.trim()
}

async function extractSimplePDFText(pdfBytes: Uint8Array): Promise<string> {
  try {
    // Convert PDF bytes to string for basic text extraction
    const pdfString = new TextDecoder('latin1').decode(pdfBytes)
    
    // Look for text objects in the PDF
    const textMatches = []
    
    // Basic regex patterns to find text content in PDF
    const patterns = [
      /\(([^)]+)\)\s*Tj/g,  // Text showing operators
      /\[([^\]]+)\]\s*TJ/g, // Text showing with individual glyph positioning
    ]
    
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(pdfString)) !== null) {
        if (match[1]) {
          // Clean up the extracted text
          let text = match[1]
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\(.)/g, '$1')
          
          // Filter out obvious non-text content
          if (text.length > 2 && /[a-zA-Z\s]/.test(text)) {
            textMatches.push(text)
          }
        }
      }
    }
    
    // Combine and clean up text
    const extractedText = textMatches
      .filter(text => text.trim().length > 0)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    console.log(`Extracted text segments: ${textMatches.length}`)
    console.log(`Final text length: ${extractedText.length}`)
    
    return extractedText
  } catch (error) {
    console.error('Error in extractSimplePDFText:', error)
    throw error
  }
}

async function generateChunkSummary(chunk: string): Promise<string> {
  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.log('Anthropic API key not found, using fallback title')
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