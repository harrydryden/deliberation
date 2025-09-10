// Centralized OpenAI model configuration utility
// Ensures consistent API parameters across all edge functions

export interface ModelConfig {
  name: string;
  maxTokens: number;
  supportsTemperature: boolean;
  isReasoning: boolean;
}

// Model registry with configurations
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // GPT-5 series - flagship models
  'gpt-5-2025-08-07': {
    name: 'gpt-5-2025-08-07',
    maxTokens: 4000,
    supportsTemperature: false,
    isReasoning: false
  },
  'gpt-5-mini-2025-08-07': {
    name: 'gpt-5-mini-2025-08-07',
    maxTokens: 4000,
    supportsTemperature: false,
    isReasoning: false
  },
  'gpt-5-nano-2025-08-07': {
    name: 'gpt-5-nano-2025-08-07',
    maxTokens: 4000,
    supportsTemperature: false,
    isReasoning: false
  },
  
  // GPT-4.1 series
  'gpt-4.1-2025-04-14': {
    name: 'gpt-4.1-2025-04-14',
    maxTokens: 4000,
    supportsTemperature: false,
    isReasoning: false
  },
  'gpt-4.1-mini-2025-04-14': {
    name: 'gpt-4.1-mini-2025-04-14',
    maxTokens: 4000,
    supportsTemperature: false,
    isReasoning: false
  },
  
  // O-series reasoning models
  'o3-2025-04-16': {
    name: 'o3-2025-04-16',
    maxTokens: 8000,
    supportsTemperature: false,
    isReasoning: true
  },
  'o4-mini-2025-04-16': {
    name: 'o4-mini-2025-04-16',
    maxTokens: 4000,
    supportsTemperature: false,
    isReasoning: true
  },
  
  // Legacy models (for backward compatibility)
  'gpt-4o': {
    name: 'gpt-4o',
    maxTokens: 4000,
    supportsTemperature: true,
    isReasoning: false
  },
  'gpt-4o-mini': {
    name: 'gpt-4o-mini',
    maxTokens: 4000,
    supportsTemperature: true,
    isReasoning: false
  }
};

export class ModelConfigManager {
  
  /**
   * Get configuration for a specific model
   */
  static getConfig(modelName: string): ModelConfig {
    const config = MODEL_CONFIGS[modelName];
    if (!config) {
      console.warn(`Unknown model: ${modelName}, falling back to default`);
      return MODEL_CONFIGS['gpt-5-2025-08-07'];
    }
    return config;
  }
  
  /**
   * Select optimal model based on task complexity and requirements
   */
  static selectOptimalModel(options: {
    complexity?: number;
    requiresReasoning?: boolean;
    maxTokensNeeded?: number;
    preferredModel?: string;
  } = {}): string {
    const { 
      complexity = 0.5, 
      requiresReasoning = false, 
      maxTokensNeeded = 1000,
      preferredModel 
    } = options;
    
    // Use preferred model if specified and valid
    if (preferredModel && MODEL_CONFIGS[preferredModel]) {
      return preferredModel;
    }
    
    // High complexity or reasoning tasks
    if (requiresReasoning || complexity > 0.8) {
      return 'o4-mini-2025-04-16'; // Fast reasoning model
    }
    
    // High token requirements
    if (maxTokensNeeded > 4000) {
      return 'o3-2025-04-16'; // Higher token limit
    }
    
    // Medium complexity
    if (complexity > 0.6) {
      return 'gpt-5-2025-08-07'; // Flagship model
    }
    
    // Simple tasks
    return 'gpt-5-mini-2025-08-07'; // Efficient for simple tasks
  }
  
  /**
   * Generate OpenAI API request parameters with correct model configuration
   */
  static generateAPIParams(
    modelName: string, 
    messages: any[], 
    options: {
      maxTokens?: number;
      stream?: boolean;
      temperature?: number;
    } = {}
  ): any {
    const config = this.getConfig(modelName);
    const { maxTokens = 1000, stream = false, temperature } = options;
    
    // Base parameters
    const params: any = {
      model: config.name,
      messages,
      stream
    };
    
    // Use correct token parameter based on model
    if (config.supportsTemperature) {
      // Legacy models use max_tokens
      params.max_tokens = Math.min(maxTokens, config.maxTokens);
      
      // Add temperature if supported and specified
      if (temperature !== undefined) {
        params.temperature = temperature;
      }
    } else {
      // Newer models use max_completion_tokens and don't support temperature
      params.max_completion_tokens = Math.min(maxTokens, config.maxTokens);
    }
    
    return params;
  }

  /**
   * Convert character limit to token count using improved 3:1 ratio
   */
  static characterLimitToTokens(characterLimit: number): number {
    // Use 3:1 ratio (more conservative) with minimum 1000 token floor
    const baseTokens = Math.ceil(characterLimit / 3) + 100;
    const tokens = Math.max(baseTokens, 1000); // Ensure minimum 1000 tokens for meaningful responses
    console.log(`🎯 Converting ${characterLimit} chars to ${tokens} tokens (3:1 ratio + 100 buffer, min 1000)`);
    return tokens;
  }
  
  /**
   * Get all available model names
   */
  static getAvailableModels(): string[] {
    return Object.keys(MODEL_CONFIGS);
  }
  
  /**
   * Check if model supports a feature
   */
  static supportsFeature(modelName: string, feature: 'temperature' | 'reasoning'): boolean {
    const config = this.getConfig(modelName);
    
    switch (feature) {
      case 'temperature':
        return config.supportsTemperature;
      case 'reasoning':
        return config.isReasoning;
      default:
        return false;
    }
  }
}

// Default model selection based on task type
export const DEFAULT_MODELS = {
  ANALYSIS: 'gpt-5-2025-08-07',
  SIMPLE_GENERATION: 'gpt-5-mini-2025-08-07',
  COMPLEX_REASONING: 'o4-mini-2025-04-16',
  LONG_FORM: 'o3-2025-04-16',
  FAST_RESPONSE: 'gpt-5-nano-2025-08-07'
} as const;