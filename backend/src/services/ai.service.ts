import OpenAI from 'openai';
import { config } from '../config';
import { logger, logTokenUsage } from '../utils/logger';
import { CacheManager } from '../utils/redis';
import { memoryService } from './memory.service';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

const cache = new CacheManager();

export interface AIServiceParams {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  traceId?: string;
}

export interface AIResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency: number;
}

export class AIService {
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(params: AIServiceParams = {}) {
    this.model = params.model || 'gpt-5-2025-08-07';
    this.maxTokens = params.maxTokens || 1000;
    this.temperature = params.temperature || 0.7;
  }

  async generateResponse(
    prompt: string,
    systemPrompt?: string,
    params: AIServiceParams = {},
    userId?: string,
    deliberationId?: string
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const traceId = params.traceId || `ai-${Date.now()}`;

    try {
      const messages: OpenAI.ChatCompletionMessageParam[] = [];
      
      if (systemPrompt) {
        messages.push({
          role: 'system',
          content: systemPrompt
        });
      }

      // Add conversation history if userId is provided
      if (userId) {
        const memoryVars = await memoryService.getMemoryVariables(userId, deliberationId);
        if (memoryVars.chat_history) {
          const historyPrompt = `Previous conversation context:\n${memoryVars.chat_history}\n\nCurrent message:`;
          messages.push({
            role: 'user',
            content: `${historyPrompt}\n${prompt}`
          });
        } else {
          messages.push({
            role: 'user',
            content: prompt
          });
        }
      } else {
        messages.push({
          role: 'user',
          content: prompt
        });
      }

      const response = await openai.chat.completions.create({
        model: params.model || this.model,
        max_completion_tokens: params.maxTokens || this.maxTokens,
        messages,
      });

      const latency = Date.now() - startTime;
      const usage = {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      };

      // Log token usage for monitoring
      logTokenUsage({
        traceId,
        service: 'openai',
        model: params.model || this.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        latency,
      });

      const content = response.choices[0]?.message?.content || '';

      // Add to memory if userId is provided
      if (userId && content) {
        await memoryService.addToMemory(userId, prompt, content, deliberationId);
      }

      return {
        content,
        usage,
        latency,
      };
    } catch (error) {
      logger.error({ error, traceId }, 'AI service error');
      throw new Error(`AI service failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async classifyInput(input: string, traceId?: string): Promise<'QUESTION' | 'STATEMENT' | 'OTHER'> {
    // Check cache first
    const cached = await cache.getCachedClassification(input);
    if (cached) {
      return cached as 'QUESTION' | 'STATEMENT' | 'OTHER';
    }

    const prompt = `Classify the following user input into exactly one category:

User input: "${input}"

Categories:
- QUESTION: Information seeking, asking for facts or explanations
- STATEMENT: Expressing opinion, making argument, taking position
- OTHER: Greetings, meta-questions, general queries

Respond with only the category name.`;

    const response = await this.generateResponse(prompt, undefined, {
      maxTokens: 50,
      traceId,
    });

    const classification = response.content.trim() as 'QUESTION' | 'STATEMENT' | 'OTHER';
    
    // Cache the result
    await cache.cacheClassification(input, classification);
    
    return classification;
  }

  async checkContentSafety(content: string, traceId?: string): Promise<{
    safe: boolean;
    reason?: string;
    confidence: number;
  }> {
    // Check cache first
    const cached = await cache.getCachedSafetyCheck(content);
    if (cached) {
      return cached;
    }

    const prompt = `Analyze this content for safety and appropriateness in a democratic deliberation context:

Content: "${content}"

Evaluate for:
- Hate speech or harassment
- Threats or violence
- Spam or irrelevant content
- Personal attacks
- Misinformation

Respond with a JSON object:
{
  "safe": boolean,
  "reason": "optional explanation if unsafe",
  "confidence": 0.0-1.0
}`;

    const response = await this.generateResponse(prompt, undefined, {
      maxTokens: 200,
      traceId,
    });

    try {
      const result = JSON.parse(response.content);
      
      // Cache the result
      await cache.cacheSafetyCheck(content, result);
      
      return result;
    } catch (error) {
      logger.error({ error, content, traceId }, 'Failed to parse safety check response');
      // Default to safe if parsing fails
      return { safe: true, confidence: 0.5 };
    }
  }

  async calculateRelevance(query: string, content: string, traceId?: string): Promise<number> {
    // Check cache first
    const cached = await cache.getCachedRelevance(query, content);
    if (cached !== null) {
      return cached;
    }

    const prompt = `Rate the semantic relevance between these texts (0-1):

Query: "${query}"
Content: "${content}"

Respond with only a decimal number.`;

    const response = await this.generateResponse(prompt, undefined, {
      maxTokens: 10,
      traceId,
    });

    const relevance = parseFloat(response.content.trim());
    const score = isNaN(relevance) ? 0 : Math.max(0, Math.min(1, relevance));
    
    // Cache the result
    await cache.cacheRelevance(query, content, score);
    
    return score;
  }

  // Stream response for real-time updates
  async *streamResponse(
    prompt: string,
    systemPrompt?: string,
    params: AIServiceParams = {}
  ): AsyncGenerator<{ content: string; done: boolean }, void, unknown> {
    const traceId = params.traceId || `ai-stream-${Date.now()}`;
    
    try {
      const messages: OpenAI.ChatCompletionMessageParam[] = [];
      
      if (systemPrompt) {
        messages.push({
          role: 'system',
          content: systemPrompt
        });
      }
      
      messages.push({
        role: 'user',
        content: prompt
      });

      const stream = await openai.chat.completions.create({
        model: params.model || this.model,
        max_completion_tokens: params.maxTokens || this.maxTokens,
        messages,
        stream: true,
      });

      let fullContent = '';
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          yield { content, done: false };
        }
      }
      
      yield { content: '', done: true };
      
      logger.info({ traceId, contentLength: fullContent.length }, 'AI stream completed');
    } catch (error) {
      logger.error({ error, traceId }, 'AI streaming error');
      throw new Error(`AI streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Singleton instance
export const aiService = new AIService();