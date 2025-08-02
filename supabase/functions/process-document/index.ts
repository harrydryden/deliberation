import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('=== DOCUMENT PROCESSING FUNCTION CALLED ===')
  console.log('Method:', req.method)
  
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    // Parse request body
    const body = await req.json()
    console.log('Processing document:', body.fileName)
    console.log('Agent ID:', body.agentId)
    console.log('Storage path:', body.storagePath)

    const { agentId, storagePath, fileName, contentType } = body

    // Check required fields
    if (!agentId || !storagePath) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing agentId or storagePath' 
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

    // Validate that the agent is a local agent (not a global template)
    console.log('Validating agent type...')
    const { data: agentData, error: agentError } = await supabase
      .from('agent_configurations')
      .select('id, deliberation_id')
      .eq('id', agentId)
      .single()

    if (agentError) {
      console.error('Agent validation error:', agentError)
      throw new Error('Invalid agent ID')
    }

    if (!agentData.deliberation_id) {
      console.error('Attempted to upload knowledge to global agent:', agentId)
      throw new Error('Knowledge can only be uploaded to local agents (specific to deliberations), not global template agents')
    }

    console.log('Agent validation passed - local agent confirmed')
    console.log('Downloading file from storage...')
    
    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storagePath)

    if (downloadError) {
      console.error('Storage download error:', downloadError)
      throw new Error(`Failed to download file: ${downloadError.message}`)
    }

    console.log('Extracting text content...')
    let textContent = ''

    if (contentType === 'pdf') {
      // For PDFs, we need to extract readable text
      try {
        const arrayBuffer = await fileData.arrayBuffer()
        const fileSize = arrayBuffer.byteLength
        console.log(`PDF file size: ${fileSize} bytes`)
        
        // For large files, limit processing to avoid memory issues
        if (fileSize > 25 * 1024 * 1024) { // 25MB limit
          throw new Error('PDF file too large. Please upload files smaller than 25MB or convert to text format.')
        }
        
        const bytes = new Uint8Array(arrayBuffer)
        
        // Extract readable text from PDF
        const decoder = new TextDecoder('utf-8', { fatal: false })
        let pdfString = decoder.decode(bytes)
        
        // If UTF-8 fails, try latin1
        if (!pdfString || pdfString.includes('�')) {
          const latin1Decoder = new TextDecoder('latin1', { fatal: false })
          pdfString = latin1Decoder.decode(bytes)
        }
        
        // Extract text patterns from PDF
        const textPatterns = []
        
        // Pattern 1: Text between parentheses (common PDF text encoding)
        const parenMatches = pdfString.match(/\(([^)]+)\)/g) || []
        textPatterns.push(...parenMatches.map(match => match.slice(1, -1)))
        
        // Pattern 2: Text between square brackets
        const bracketMatches = pdfString.match(/\[([^\]]+)\]/g) || []
        textPatterns.push(...bracketMatches.map(match => match.slice(1, -1)))
        
        // Pattern 3: Look for plain text sequences
        const plainTextMatches = pdfString.match(/[A-Za-z][A-Za-z\s]{10,}/g) || []
        textPatterns.push(...plainTextMatches)
        
        // Pattern 4: Extract from stream objects
        const streamMatches = pdfString.match(/stream\s+(.*?)\s+endstream/gs) || []
        streamMatches.forEach(stream => {
          const streamContent = stream.replace(/^stream\s+|\s+endstream$/g, '')
          const textInStream = streamContent.match(/[A-Za-z][A-Za-z\s]{5,}/g) || []
          textPatterns.push(...textInStream)
        })
        
        // Filter and clean extracted text
        const cleanedText = textPatterns
          .filter(text => {
            // Filter out binary junk and keep meaningful text
            return text && 
                   text.length > 3 && 
                   /[A-Za-z]/.test(text) &&
                   !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/.test(text) &&
                   text.split(' ').length > 1
          })
          .map(text => text.trim())
          .filter(text => text.length > 0)
        
        textContent = cleanedText.join(' ')
        
        // If extraction was minimal, provide a meaningful fallback
        if (textContent.length < 100) {
          textContent = `PDF Document: ${fileName}. 
This PDF contains primarily structured data, forms, or images that cannot be easily extracted as plain text.
File size: ${Math.round(fileSize / 1024)} KB.
For better text extraction, please convert this PDF to a plain text format before uploading or ensure the PDF contains selectable text.`
        }
        
      } catch (error) {
        console.error('PDF processing error:', error)
        throw new Error(`PDF processing failed: ${error.message}`)
      }
    } else {
      // For text files
      textContent = await fileData.text()
    }

    if (!textContent || textContent.trim().length < 10) {
      throw new Error('No meaningful text content extracted from the document')
    }

    console.log(`Extracted text length: ${textContent.length}`)

    // Chunk the text
    const chunks = chunkText(textContent, 1000, 200)
    console.log(`Created ${chunks.length} chunks`)

    let processedChunks = 0

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      
      if (chunk.trim().length < 50) continue

      console.log(`Processing chunk ${i + 1}/${chunks.length}`)
      
      // Generate embedding
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
        continue
      }

      const embeddingData = await embeddingResponse.json()
      const embeddingVector = embeddingData.data[0].embedding

      // Sanitize chunk content to remove null bytes and other problematic characters
      const sanitizedChunk = chunk
        .replace(/\u0000/g, '') // Remove null bytes
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control characters
        .trim()

      if (sanitizedChunk.length < 50) continue

      // Insert into agent_knowledge table
      const { error: insertError } = await supabase
        .from('agent_knowledge')
        .insert({
          agent_id: agentId,
          title: `${fileName} - Part ${i + 1}`,
          content: sanitizedChunk,
          content_type: contentType, // This will now be 'pdf' or 'text'
          file_name: fileName,
          chunk_index: i,
          file_size: textContent.length,
          embedding: embeddingVector,
          storage_path: storagePath,
          original_file_size: fileData.size,
          processing_status: 'completed',
          metadata: {
            total_chunks: chunks.length,
            chunk_size: chunk.length,
            original_file_type: contentType
          }
        })

      if (insertError) {
        console.error(`Error inserting chunk ${i + 1}:`, insertError)
        continue
      }

      processedChunks++
    }

    console.log(`Processing complete. ${processedChunks} chunks processed.`)
    
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
    console.error('=== ERROR IN DOCUMENT PROCESSING ===')
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Document processing error: ${error.message}`
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

// Helper function to chunk text
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + chunkSize
    
    if (end < text.length) {
      // Look for sentence boundaries
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

    start = end - overlap
    if (start >= text.length) break
  }

  return chunks
}