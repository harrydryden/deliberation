// Enhanced OpenAI client with timeout handling and circuit breaker
import { EdgeLogger, withTimeout, withRetry } from './edge-logger.ts';
import { openAICircuitBreaker } from './circuit-breaker.ts';

interface OpenAIRequest {
  model: string;
  messages: any[];
  max_completion_tokens?: number;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

interface OpenAIConfig {
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
}

export class EnhancedOpenAIClient {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';
  
  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.apiKey = apiKey;
  }

  async createChatCompletion(
    request: OpenAIRequest, 
    config: OpenAIConfig = {}
  ): Promise<any> {
    const {
      timeoutMs = 45000,
      maxRetries = 2,
      baseDelayMs = 1000
    } = config;

    // Validate and adjust request based on model
    const validatedRequest = this.validateRequest(request);
    
    const operation = async (): Promise<any> => {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validatedRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorDetails;
        try {
          errorDetails = JSON.parse(errorText);
        } catch {
          errorDetails = { error: { message: errorText } };
        }
        
        EdgeLogger.error('OpenAI API error', {
          status: response.status,
          error: errorDetails,
          model: validatedRequest.model
        });
        
        throw new Error(`OpenAI API error: ${response.status} - ${errorDetails.error?.message || errorText}`);
      }

      return response.json();
    };

    // Execute with circuit breaker, timeout, and retry
    return openAICircuitBreaker.execute(async () => {
      return withRetry(
        () => withTimeout(operation(), timeoutMs, 'OpenAI API call'),
        maxRetries,
        baseDelayMs,
        'OpenAI Chat Completion'
      );
    });
  }

  async createEmbedding(
    input: string | string[],
    model: string = 'text-embedding-3-small',
    config: OpenAIConfig = {}
  ): Promise<any> {
    const {
      timeoutMs = 30000,
      maxRetries = 2,
      baseDelayMs = 1000
    } = config;

    const operation = async (): Promise<any> => {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input,
          encoding_format: 'float'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Embeddings API error: ${response.status} - ${errorText}`);
      }

      return response.json();
    };

    return openAICircuitBreaker.execute(async () => {
      return withRetry(
        () => withTimeout(operation(), timeoutMs, 'OpenAI Embeddings call'),
        maxRetries,
        baseDelayMs,
        'OpenAI Embeddings'
      );
    });
  }

  private validateRequest(request: OpenAIRequest): OpenAIRequest {
    const { model } = request;
    const isNewerModel = this.isNewerModel(model);
    
    const validatedRequest = { ...request };
    
    if (isNewerModel) {
      // Newer models: use max_completion_tokens, no temperature
      if (request.max_tokens) {
        validatedRequest.max_completion_tokens = request.max_tokens;
        delete validatedRequest.max_tokens;
      }
      if (request.temperature !== undefined) {
        EdgeLogger.warn('Removing temperature parameter for newer model', { model });
        delete validatedRequest.temperature;
      }
    } else {
      // Legacy models: use max_tokens, temperature allowed
      if (request.max_completion_tokens) {
        validatedRequest.max_tokens = request.max_completion_tokens;
        delete validatedRequest.max_completion_tokens;
      }
    }

    return validatedRequest;
  }

  private isNewerModel(model: string): boolean {
    const newerModels = [
      'gpt-5-2025-08-07',
      'gpt-5-mini-2025-08-07', 
      'gpt-5-nano-2025-08-07',
      'gpt-4.1-2025-04-14',
      'gpt-4.1-mini-2025-04-14',
      'o3-2025-04-16',
      'o4-mini-2025-04-16'
    ];
    
    return newerModels.some(newerModel => model.includes(newerModel));
  }

  getCircuitBreakerStatus() {
    return openAICircuitBreaker.getMetrics();
  }
}

// Utility function to create client from environment
export function createOpenAIClient(): EnhancedOpenAIClient {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }
  return new EnhancedOpenAIClient(apiKey);
}