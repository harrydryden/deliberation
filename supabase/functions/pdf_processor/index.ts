import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";

// ============================================================================
// SOPHISTICATED PDF PROCESSING WITH SHARED FUNCTIONALITY INLINED
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, cache-control, x-requested-with',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

// ============================================================================
// ENHANCED EDGE LOGGER
// ============================================================================

class EdgeLogger {
  private static formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] ${message}${dataStr}`;
  }

  static debug(message: string, data?: any): void {
    );
  }

  static info(message: string, data?: any): void {
    );
  }

  static warn(message: string, data?: any): void {
    );
  }

  static error(message: string, data?: any): void {
    );
  }
}

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

class CircuitBreaker {
  private static readonly CIRCUIT_BREAKER_ID = 'pdf_processing';
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private static readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

  constructor(private supabase: any) {}

  async isOpen(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('circuit_breaker_state')
        .select('*')
        .eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID)
        .maybeSingle();

      if (error || !data) return false;

      const now = Date.now();
      const lastFailureTime = new Date(data.last_failure_time).getTime();
      
      if (data.failure_count >= CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD) {
        const timeSinceLastFailure = now - lastFailureTime;
        
        if (timeSinceLastFailure < CircuitBreaker.CIRCUIT_BREAKER_TIMEOUT) {
          EdgeLogger.warn(`Circuit breaker OPEN - ${Math.ceil((CircuitBreaker.CIRCUIT_BREAKER_TIMEOUT - timeSinceLastFailure) / 1000)}s remaining`);
          return true;
        } else {
          await this.reset();
          return false;
        }
      }
      
      return false;
    } catch (error) {
      EdgeLogger.warn('Circuit breaker check failed, assuming closed', error);
      return false;
    }
  }

  async recordFailure(): Promise<void> {
    try {
      const now = new Date();
      const { data: currentState } = await this.supabase
        .from('circuit_breaker_state')
        .select('failure_count')
        .eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID)
        .maybeSingle();

      const newFailureCount = (currentState?.failure_count || 0) + 1;
      
      await this.supabase
        .from('circuit_breaker_state')
        .upsert({
          id: CircuitBreaker.CIRCUIT_BREAKER_ID,
          failure_count: newFailureCount,
          last_failure_time: now,
          is_open: newFailureCount >= CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD,
          updated_at: now
        }, { onConflict: 'id' });

      EdgeLogger.info(`Circuit breaker failure recorded: ${newFailureCount}/${CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD}`);
    } catch (error) {
      EdgeLogger.error('Failed to record circuit breaker failure', error);
    }
  }

  async reset(): Promise<void> {
    try {
      await this.supabase
        .from('circuit_breaker_state')
        .update({
          failure_count: 0,
          is_open: false,
          updated_at: new Date()
        })
        .eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID);
      EdgeLogger.info('Circuit breaker RESET');
    } catch (error) {
      EdgeLogger.error('Failed to reset circuit breaker', error);
    }
  }
}

// ============================================================================
// ENHANCED PDF PROCESSING SERVICE
// ============================================================================

class PDFProcessingService {
  private circuitBreaker: CircuitBreaker;
  private supabase: any;
  private openaiApiKey: string;

  constructor(supabase: any, openaiApiKey: string) {
    this.supabase = supabase;
    this.openaiApiKey = openaiApiKey;
    this.circuitBreaker = new CircuitBreaker(supabase);
  }

  async processPDF(pdfData: string, filename: string, agentId?: string): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using fallback PDF processing');
      return this.generateFallbackProcessing(filename);
    }

    try {
      EdgeLogger.info('Starting PDF processing', {
        filename,
        agentId,
        dataLength: pdfData.length
      });

      // Validate PDF data
      if (!pdfData || pdfData.length === 0) {
        throw new Error('No PDF data provided');
      }

      // Convert base64 to buffer
      const pdfBuffer = Uint8Array.from(atob(pdfData), c => c.charCodeAt(0));
      
      // Validate PDF format and size
      if (pdfBuffer.length === 0) {
        throw new Error('Invalid PDF data format');
      }

      const maxSize = 10 * 1024 * 1024; // 10MB limit
      if (pdfBuffer.length > maxSize) {
        throw new Error(`PDF file too large: ${pdfBuffer.length} bytes (max: ${maxSize})`);
      }

      EdgeLogger.debug('PDF data validated', {
        bufferSize: pdfBuffer.length,
        filename
      });

      // Process PDF using OpenAI
      const processingResult = await this.processWithOpenAI(pdfBuffer, filename);

      // Store processed content in database
      const storageResult = await this.storeProcessedContent(
        processingResult,
        filename,
        agentId
      );

      const duration = Date.now() - startTime;
      EdgeLogger.info('PDF processing completed successfully', {
        filename,
        chunksCreated: processingResult.chunks?.length || 0,
        duration
      });

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      return {
        success: true,
        filename,
        chunks: processingResult.chunks || [],
        summary: processingResult.summary,
        metadata: {
          processingTimeMs: duration,
          fileSizeBytes: pdfBuffer.length,
          chunksCreated: processingResult.chunks?.length || 0,
          agentId,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('PDF processing failed', {
        error: error.message,
        duration,
        filename
      });

      await this.circuitBreaker.recordFailure();
      
      return this.generateErrorResponse(error.message, filename);
    }
  }

  private async processWithOpenAI(pdfBuffer: Uint8Array, filename: string): Promise<any> {
    const formData = new FormData();
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('file', pdfBlob, filename);
    formData.append('model', 'gpt-4o-mini');
    formData.append('response_format', 'json_object');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const result = await response.json();
    
    if (!result.choices?.[0]?.message?.content) {
      throw new Error('No processing result from OpenAI');
    }

    try {
      const processingResult = JSON.parse(result.choices[0].message.content);
      
      EdgeLogger.debug('OpenAI PDF processing completed', {
        filename,
        chunksCount: processingResult.chunks?.length || 0,
        hasSummary: !!processingResult.summary
      });

      return processingResult;
    } catch (parseError) {
      EdgeLogger.error('Failed to parse OpenAI PDF processing result', {
        error: parseError.message,
        filename
      });
      throw new Error('Invalid processing result format from OpenAI');
    }
  }

  private async storeProcessedContent(
    processingResult: any,
    filename: string,
    agentId?: string
  ): Promise<any> {
    if (!processingResult.chunks || processingResult.chunks.length === 0) {
      EdgeLogger.warn('No chunks to store', { filename });
      return { stored: 0 };
    }

    let storedCount = 0;
    const chunks = processingResult.chunks.map((chunk: any, index: number) => ({
      id: crypto.randomUUID(),
      title: chunk.title || `Chunk ${index + 1}`,
      content: chunk.content || '',
      metadata: {
        filename,
        chunkIndex: index,
        agentId: agentId || null,
        processedAt: new Date().toISOString()
      },
      agent_id: agentId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // Store chunks in batches
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      try {
        const { error } = await this.supabase
          .from('agent_knowledge')
          .insert(batch);

        if (error) {
          EdgeLogger.warn('Failed to store chunk batch', {
            error: error.message,
            batchStart: i,
            batchSize: batch.length
          });
        } else {
          storedCount += batch.length;
        }
      } catch (error) {
        EdgeLogger.warn('Error storing chunk batch', {
          error: error.message,
          batchStart: i,
          batchSize: batch.length
        });
      }
    }

    EdgeLogger.debug('PDF chunks stored', {
      filename,
      totalChunks: chunks.length,
      storedChunks: storedCount
    });

    return { stored: storedCount };
  }

  private generateFallbackProcessing(filename: string): any {
    EdgeLogger.info('Generating fallback PDF processing response', { filename });
    
    return {
      success: true,
      filename,
      chunks: [],
      summary: "PDF processing unavailable at this time.",
      metadata: {
        source: 'fallback',
        processingTimeMs: 0,
        chunksCreated: 0,
        reason: 'Circuit breaker open'
      }
    };
  }

  private generateErrorResponse(errorMessage: string, filename: string): any {
    return {
      success: false,
      filename,
      chunks: [],
      summary: "",
      error: errorMessage,
      metadata: {
        processingTimeMs: 0,
        chunksCreated: 0,
        reason: 'Processing failed'
      }
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function handleCORSPreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

function createErrorResponse(error: any, status: number = 500, context?: string): Response {
  const errorId = crypto.randomUUID();
  EdgeLogger.error(`${context || 'Edge Function'} Error`, { errorId, error: error?.message });
  
  return new Response(
    JSON.stringify({
      error: error?.message || 'An unexpected error occurred',
      errorId,
      context,
      timestamp: new Date().toISOString()
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

function createSuccessResponse(data: any): Response {
  return new Response(
    JSON.stringify(data),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

async function parseAndValidateRequest<T>(request: Request, requiredFields: string[] = []): Promise<T> {
  const requestId = crypto.randomUUID().slice(0, 8);
  
  EdgeLogger.debug('Parsing PDF processing request', { requestId, requiredFields });
  
  try {
    const body = await request.json();
    
    for (const field of requiredFields) {
      if (!(field in body) || body[field] === null || body[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    EdgeLogger.debug('Request validation successful', { requestId });
    return body as T;
  } catch (error: any) {
    EdgeLogger.error('Request parsing failed', { requestId, error: error.message });
    throw new Error(`Request parsing failed: ${error.message}`);
  }
}

function getOpenAIKey(): string {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }
  return apiKey;
}

async function validateAndGetEnvironment() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!openaiApiKey) missing.push('OPENAI_API_KEY');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    supabase: createClient(supabaseUrl, supabaseServiceKey),
    openaiApiKey
  };
}

// ============================================================================
// INTERFACES
// ============================================================================

interface PDFProcessingRequest {
  pdfData: string;
  filename: string;
  agentId?: string;
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    EdgeLogger.info('PDF processor function called', { 
      method: req.method, 
      url: req.url 
    });

    const { pdfData, filename, agentId }: PDFProcessingRequest = await parseAndValidateRequest(req, ['pdfData', 'filename']);
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();

    EdgeLogger.info('Processing PDF request', {
      filename,
      agentId,
      dataLength: pdfData.length
    });

    // Create PDF processing service
    const pdfService = new PDFProcessingService(supabase, openaiApiKey);
    
    // Process PDF
    const result = await pdfService.processPDF(pdfData, filename, agentId);

    EdgeLogger.info('PDF processing completed', {
      success: result.success,
      filename: result.filename,
      chunksCreated: result.chunks?.length || 0
    });

    return createSuccessResponse(result);

  } catch (error) {
    EdgeLogger.error('PDF processing error', error);
    return createErrorResponse(error, 500, 'PDF processing');
  }
});