import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";

// ============================================================================
// EMBEDDINGS BACKFILL SERVICE
// Generates embeddings for existing agent_knowledge records
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept, cache-control, x-requested-with",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

class EmbeddingsBackfillLogger {
  private static formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] ${message}${dataStr}`;
  }

  static debug(message: string, data?: any): void {
    console.log(this.formatMessage('DEBUG', message, data));
  }

  static info(message: string, data?: any): void {
    console.log(this.formatMessage('INFO', message, data));
  }

  static warn(message: string, data?: any): void {
    console.warn(this.formatMessage('WARN', message, data));
  }

  static error(message: string, data?: any): void {
    console.error(this.formatMessage('ERROR', message, data));
  }
}

// ============================================================================
// EMBEDDING GENERATION SERVICE
// ============================================================================

class EmbeddingService {
  private openaiApiKey: string;
  private supabase: any;
  private rateLimitDelay: number = 100; // ms between requests

  constructor(openaiApiKey: string, supabase: any) {
    this.openaiApiKey = openaiApiKey;
    this.supabase = supabase;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        model: "text-embedding-3-small", 
        input: text.slice(0, 8000) // Limit input size
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI embeddings error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const vector = data?.data?.[0]?.embedding;
    
    if (!Array.isArray(vector)) {
      throw new Error("Invalid embedding response format");
    }
    
    return vector as number[];
  }

  async backfillAgentEmbeddings(agentId?: string, batchSize: number = 10): Promise<any> {
    const startTime = Date.now();
    EmbeddingsBackfillLogger.info('Starting embeddings backfill', { agentId, batchSize });

    let processedCount = 0;
    let errorCount = 0;
    let updatedCount = 0;
    
    try {
      // Get records without embeddings
      let query = this.supabase
        .from('agent_knowledge')
        .select('id, title, content, agent_id, file_name')
        .is('embedding', null)
        .order('created_at', { ascending: true });

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data: records, error: fetchError } = await query.limit(1000);

      if (fetchError) {
        throw new Error(`Failed to fetch records: ${fetchError.message}`);
      }

      if (!records || records.length === 0) {
        EmbeddingsBackfillLogger.info('No records found without embeddings', { agentId });
        return {
          success: true,
          message: "No records need embedding backfill",
          processed: 0,
          updated: 0,
          errors: 0,
          durationMs: Date.now() - startTime
        };
      }

      EmbeddingsBackfillLogger.info(`Found ${records.length} records without embeddings`, { agentId });

      // Process in batches
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        EmbeddingsBackfillLogger.debug(`Processing batch ${Math.floor(i/batchSize) + 1}`, {
          batchSize: batch.length,
          totalBatches: Math.ceil(records.length / batchSize)
        });

        for (const record of batch) {
          try {
            processedCount++;
            
            // Create text for embedding (title + content)
            const embeddingText = `${record.title || ''}\n\n${record.content || ''}`.trim();
            
            if (!embeddingText) {
              EmbeddingsBackfillLogger.warn('Skipping record with no text content', { 
                id: record.id,
                fileName: record.file_name
              });
              continue;
            }

            // Generate embedding
            const embedding = await this.generateEmbedding(embeddingText);
            
            // Update the record
            const { error: updateError } = await this.supabase
              .from('agent_knowledge')
              .update({ 
                embedding: JSON.stringify(embedding),
                updated_at: new Date().toISOString()
              })
              .eq('id', record.id);

            if (updateError) {
              EmbeddingsBackfillLogger.error('Failed to update record embedding', {
                id: record.id,
                error: updateError.message
              });
              errorCount++;
            } else {
              updatedCount++;
              EmbeddingsBackfillLogger.debug('Successfully updated embedding', {
                id: record.id,
                fileName: record.file_name,
                embeddingDimensions: embedding.length
              });
            }

            // Rate limiting
            if (this.rateLimitDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
            }

          } catch (error) {
            errorCount++;
            EmbeddingsBackfillLogger.error('Error processing record', {
              id: record.id,
              fileName: record.file_name,
              error: error.message
            });
            
            // Continue with next record
            continue;
          }
        }

        // Longer delay between batches
        if (i + batchSize < records.length) {
          EmbeddingsBackfillLogger.debug(`Completed batch, waiting before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const duration = Date.now() - startTime;
      
      EmbeddingsBackfillLogger.info('Embeddings backfill completed', {
        agentId,
        totalRecords: records.length,
        processed: processedCount,
        updated: updatedCount,
        errors: errorCount,
        durationMs: duration,
        successRate: `${((updatedCount / processedCount) * 100).toFixed(1)}%`
      });

      return {
        success: true,
        message: `Backfill completed successfully`,
        totalRecords: records.length,
        processed: processedCount,
        updated: updatedCount,
        errors: errorCount,
        durationMs: duration,
        agentId: agentId || 'all_agents'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EmbeddingsBackfillLogger.error('Embeddings backfill failed', {
        error: error.message,
        processed: processedCount,
        updated: updatedCount,
        errors: errorCount,
        durationMs: duration
      });

      return {
        success: false,
        error: error.message,
        processed: processedCount,
        updated: updatedCount,
        errors: errorCount,
        durationMs: duration
      };
    }
  }

  async getEmbeddingStats(agentId?: string): Promise<any> {
    try {
      let query = this.supabase
        .from('agent_knowledge')
        .select('id, embedding, agent_id, created_at');

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data: records, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch embedding stats: ${error.message}`);
      }

      const total = records?.length || 0;
      const withEmbeddings = records?.filter(r => r.embedding !== null).length || 0;
      const withoutEmbeddings = total - withEmbeddings;

      return {
        success: true,
        stats: {
          agentId: agentId || 'all_agents',
          totalRecords: total,
          withEmbeddings,
          withoutEmbeddings,
          embeddingCoverage: total > 0 ? `${((withEmbeddings / total) * 100).toFixed(1)}%` : '0%'
        }
      };

    } catch (error) {
      EmbeddingsBackfillLogger.error('Failed to get embedding stats', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnvironment() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  
  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } as const;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    EmbeddingsBackfillLogger.info('Embeddings backfill function called', {
      method: req.method,
      url: req.url
    });

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } = getEnvironment();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const agentId: string | undefined = body?.agentId || body?.agent_id || undefined;
    const operation: string = body?.operation || 'backfill';
    const batchSize: number = Number(body?.batchSize) || 10;

    const embeddingService = new EmbeddingService(OPENAI_API_KEY, supabase);

    if (operation === 'stats') {
      const result = await embeddingService.getEmbeddingStats(agentId);
      return jsonResponse(result);
    } else if (operation === 'backfill') {
      const result = await embeddingService.backfillAgentEmbeddings(agentId, batchSize);
      return jsonResponse(result);
    } else {
      return jsonResponse({
        success: false,
        error: `Unknown operation: ${operation}. Use 'backfill' or 'stats'.`
      }, 400);
    }

  } catch (err) {
    const errorDuration = Date.now() - startTime;
    EmbeddingsBackfillLogger.error("Embeddings backfill fatal error", { 
      error: (err as Error)?.message ?? String(err),
      durationMs: errorDuration
    });
    
    return jsonResponse({ 
      success: false, 
      error: (err as Error)?.message ?? String(err),
      durationMs: errorDuration
    }, 500);
  }
});