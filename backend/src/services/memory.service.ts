import { ConversationBufferWindowMemory, ConversationSummaryMemory } from 'langchain/memory';
import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config';
import { logger } from '../utils/logger';
import { CacheManager } from '../utils/redis';

interface MemoryKey {
  userId: string;
  deliberationId?: string;
}

interface StoredMemory {
  messages: Array<{ role: string; content: string }>;
  summary?: string;
  lastUpdated: number;
}

export class MemoryService {
  private cache: CacheManager;
  private llm: ChatOpenAI;
  private windowMemories: Map<string, ConversationBufferWindowMemory> = new Map();
  private summaryMemories: Map<string, ConversationSummaryMemory> = new Map();

  constructor() {
    this.cache = new CacheManager();
    this.llm = new ChatOpenAI({
      openAIApiKey: config.openaiApiKey,
      modelName: 'gpt-5-2025-08-07',
    });
  }

  private getMemoryKey(userId: string, deliberationId?: string): string {
    return deliberationId ? `${userId}:${deliberationId}` : userId;
  }

  private async loadStoredMemory(key: string): Promise<StoredMemory | null> {
    try {
      const stored = await this.cache.get(`memory:${key}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      logger.warn({ error, key }, 'Failed to load stored memory');
      return null;
    }
  }

  private async saveMemory(key: string, memory: StoredMemory): Promise<void> {
    try {
      await this.cache.set(`memory:${key}`, JSON.stringify(memory), 86400); // 24 hours TTL
    } catch (error) {
      logger.error({ error, key }, 'Failed to save memory');
    }
  }

  async getWindowMemory(userId: string, deliberationId?: string, windowSize = 10): Promise<ConversationBufferWindowMemory> {
    const key = this.getMemoryKey(userId, deliberationId);
    
    if (this.windowMemories.has(key)) {
      return this.windowMemories.get(key)!;
    }

    const memory = new ConversationBufferWindowMemory({
      k: windowSize,
      returnMessages: true,
    });

    // Load stored conversation history
    const stored = await this.loadStoredMemory(key);
    if (stored?.messages) {
      for (const msg of stored.messages.slice(-windowSize)) {
        if (msg.role === 'user') {
          await memory.chatHistory.addUserMessage(msg.content);
        } else if (msg.role === 'assistant') {
          await memory.chatHistory.addAIChatMessage(msg.content);
        }
      }
    }

    this.windowMemories.set(key, memory);
    return memory;
  }

  async getSummaryMemory(userId: string, deliberationId?: string): Promise<ConversationSummaryMemory> {
    const key = this.getMemoryKey(userId, deliberationId);
    
    if (this.summaryMemories.has(key)) {
      return this.summaryMemories.get(key)!;
    }

    const memory = new ConversationSummaryMemory({
      llm: this.llm,
      returnMessages: true,
    });

    // Load stored conversation history and summary
    const stored = await this.loadStoredMemory(key);
    if (stored) {
      if (stored.summary) {
        memory.buffer = stored.summary;
      }
      
      if (stored.messages) {
        for (const msg of stored.messages) {
          if (msg.role === 'user') {
            await memory.chatHistory.addUserMessage(msg.content);
          } else if (msg.role === 'assistant') {
            await memory.chatHistory.addAIChatMessage(msg.content);
          }
        }
      }
    }

    this.summaryMemories.set(key, memory);
    return memory;
  }

  async addToMemory(
    userId: string, 
    userMessage: string, 
    assistantMessage: string, 
    deliberationId?: string
  ): Promise<void> {
    const key = this.getMemoryKey(userId, deliberationId);

    try {
      // Add to window memory
      const windowMemory = await this.getWindowMemory(userId, deliberationId);
      await windowMemory.chatHistory.addUserMessage(userMessage);
      await windowMemory.chatHistory.addAIChatMessage(assistantMessage);

      // Add to summary memory for longer conversations
      const summaryMemory = await this.getSummaryMemory(userId, deliberationId);
      await summaryMemory.chatHistory.addUserMessage(userMessage);
      await summaryMemory.chatHistory.addAIChatMessage(assistantMessage);

      // Persist to cache
      await this.persistMemory(key);
      
      logger.info({ userId, deliberationId, key }, 'Added messages to memory');
    } catch (error) {
      logger.error({ error, userId, deliberationId }, 'Failed to add to memory');
    }
  }

  async getConversationHistory(userId: string, deliberationId?: string): Promise<Array<{ role: string; content: string }>> {
    const key = this.getMemoryKey(userId, deliberationId);
    const stored = await this.loadStoredMemory(key);
    return stored?.messages || [];
  }

  async clearMemory(userId: string, deliberationId?: string): Promise<void> {
    const key = this.getMemoryKey(userId, deliberationId);
    
    try {
      this.windowMemories.delete(key);
      this.summaryMemories.delete(key);
      await this.cache.del(`memory:${key}`);
      
      logger.info({ userId, deliberationId, key }, 'Cleared memory');
    } catch (error) {
      logger.error({ error, userId, deliberationId }, 'Failed to clear memory');
    }
  }

  private async persistMemory(key: string): Promise<void> {
    try {
      const windowMemory = this.windowMemories.get(key);
      const summaryMemory = this.summaryMemories.get(key);

      let messages: Array<{ role: string; content: string }> = [];
      let summary: string | undefined;

      if (windowMemory) {
        const chatMessages = await windowMemory.chatHistory.getMessages();
        messages = chatMessages.map(msg => ({
          role: msg._getType() === 'human' ? 'user' : 'assistant',
          content: msg.content as string,
        }));
      }

      if (summaryMemory) {
        summary = summaryMemory.buffer;
      }

      const storedMemory: StoredMemory = {
        messages,
        summary,
        lastUpdated: Date.now(),
      };

      await this.saveMemory(key, storedMemory);
    } catch (error) {
      logger.error({ error, key }, 'Failed to persist memory');
    }
  }

  async getMemoryVariables(userId: string, deliberationId?: string): Promise<Record<string, any>> {
    try {
      // Use window memory for recent context (better for short-term conversations)
      const windowMemory = await this.getWindowMemory(userId, deliberationId);
      const windowVars = await windowMemory.loadMemoryVariables({});

      // Use summary memory for long-term context if available
      const summaryMemory = await this.getSummaryMemory(userId, deliberationId);
      const summaryVars = await summaryMemory.loadMemoryVariables({});

      // Combine both memories for rich context
      return {
        ...windowVars,
        summary: summaryVars.history || '',
        chat_history: windowVars.history || '',
      };
    } catch (error) {
      logger.error({ error, userId, deliberationId }, 'Failed to get memory variables');
      return { history: '', summary: '' };
    }
  }
}

export const memoryService = new MemoryService();