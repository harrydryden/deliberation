/**
 * Robust OpenAI API error handling and retry logic for edge functions
 */

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

interface OpenAIRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export class OpenAIErrorHandler {
  private static defaultConfig: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    timeoutMs: 55000
  };

  /**
   * Make OpenAI API request with retry logic and error recovery
   */
  static async makeRequest(
    request: OpenAIRequest, 
    config: Partial<RetryConfig> = {}
  ): Promise<Response> {
    const finalConfig = { ...this.defaultConfig, ...config };
    let lastError: Error;

    for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
      try {
        // Add timeout wrapper
        const response = await this.withTimeout(
          fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body
          }),
          finalConfig.timeoutMs
        );

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.calculateBackoffDelay(attempt, finalConfig);
          
          `);
          
          if (attempt < finalConfig.maxRetries) {
            await this.sleep(delay);
            continue;
          }
        }

        // Handle server errors with retry
        if (response.status >= 500 && attempt < finalConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt, finalConfig);
          `);
          await this.sleep(delay);
          continue;
        }

        // Handle organization verification error with fallback
        if (!response.ok) {
          const errorText = await response.text();
          
          if (errorText.includes('organization must be verified')) {
            // Try to modify request for non-streaming mode
            const fallbackRequest = this.createFallbackRequest(request);
            if (fallbackRequest && attempt === 0) {
              return this.makeRequest(fallbackRequest, { ...config, maxRetries: 1 });
            }
          }

          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        return response;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === finalConfig.maxRetries) {
          break;
        }

        const delay = this.calculateBackoffDelay(attempt, finalConfig);
        :`, error.message);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Stream response handler with error recovery
   */
  static async handleStreamResponse(
    response: Response,
    onChunk: (content: string, done: boolean) => void,
    onError?: (error: Error) => void
  ): Promise<string> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    if (!reader) {
      throw new Error('No response body reader available');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          if (line.includes('[DONE]')) continue;

          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content || '';
            
            if (content) {
              fullResponse += content;
              onChunk(content, false);
            }
          } catch (parseError) {
            // Continue processing other chunks
          }
        }
      }

      onChunk('', true); // Signal completion
      return fullResponse;
    } catch (error) {
      if (onError) {
        onError(error as Error);
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Create fallback request for organization verification issues
   */
  private static createFallbackRequest(originalRequest: OpenAIRequest): OpenAIRequest | null {
    try {
      const body = JSON.parse(originalRequest.body);
      
      // If streaming, try non-streaming
      if (body.stream) {
        return {
          ...originalRequest,
          body: JSON.stringify({ ...body, stream: false })
        };
      }

      // If using newer model with unsupported params, try fallback model
      if (body.model?.startsWith('gpt-5') || body.model?.startsWith('gpt-4.1')) {
        const fallbackBody = { ...body };
        delete fallbackBody.temperature; // Remove unsupported param
        fallbackBody.model = 'gpt-4o-mini'; // Use older stable model
        
        if (fallbackBody.max_completion_tokens) {
          fallbackBody.max_tokens = fallbackBody.max_completion_tokens;
          delete fallbackBody.max_completion_tokens;
        }

        return {
          ...originalRequest,
          body: JSON.stringify(fallbackBody)
        };
      }
    } catch (error) {
      }

    return null;
  }

  /**
   * Add timeout to fetch request
   */
  private static async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private static calculateBackoffDelay(attempt: number, config: RetryConfig): number {
    const baseDelay = config.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
    return Math.min(baseDelay + jitter, config.maxDelayMs);
  }

  /**
   * Sleep utility
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Quick validation for OpenAI response format
   */
  static validateResponse(response: any): void {
    if (!response?.choices?.[0]) {
      throw new Error('Invalid OpenAI response format: missing choices');
    }

    const choice = response.choices[0];
    if (!choice.message && !choice.delta) {
      throw new Error('Invalid OpenAI response format: missing message/delta');
    }
  }

  /**
   * Extract content from OpenAI response safely
   */
  static extractContent(response: any): string {
    this.validateResponse(response);
    return response.choices[0].message?.content || 
           response.choices[0].delta?.content || '';
  }
}