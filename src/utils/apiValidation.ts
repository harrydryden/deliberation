/**
 * API validation utilities with runtime type checking using Zod schemas
 */
import { z } from 'zod';
import {
  UserSchema,
  MessageSchema,
  DeliberationSchema,
  agentConfigurationSchema,
  IbisNodeSchema,
  UserAccessCodeSchema,
  ApiResponseSchema,
  PaginatedResponseSchema,
  validateAndParse,
  createValidator
} from '@/schemas';
import { AppError, ValidationError } from './errorHandling';
import { logger } from './logger';

// API response validation
export class ApiValidator {
  // Validate user response
  static validateUser(data: unknown): ReturnType<typeof UserSchema.parse> {
    try {
      return validateAndParse(UserSchema, data);
    } catch (error) {
      logger.error('User validation failed', { data, error });
      throw new ValidationError('Invalid user data format', 'user', { 
        originalData: data,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
    }
  }

  // Validate message response
  static validateMessage(data: unknown): ReturnType<typeof MessageSchema.parse> {
    try {
      return validateAndParse(MessageSchema, data);
    } catch (error) {
      logger.error('Message validation failed', { data, error });
      throw new ValidationError('Invalid message data format', 'message', {
        originalData: data,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
    }
  }

  // Validate deliberation response
  static validateDeliberation(data: unknown): ReturnType<typeof DeliberationSchema.parse> {
    try {
      return validateAndParse(DeliberationSchema, data);
    } catch (error) {
      logger.error('Deliberation validation failed', { data, error });
      throw new ValidationError('Invalid deliberation data format', 'deliberation', {
        originalData: data,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
    }
  }

  // Validate agent configuration response
  static validateAgentConfiguration(data: unknown): ReturnType<typeof agentConfigurationSchema.parse> {
    try {
      return validateAndParse(agentConfigurationSchema, data);
    } catch (error) {
      logger.error('Agent configuration validation failed', { data, error });
      throw new ValidationError('Invalid agent configuration data format', 'agent_config', {
        originalData: data,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
    }
  }

  // Validate IBIS node response
  static validateIbisNode(data: unknown): ReturnType<typeof IbisNodeSchema.parse> {
    try {
      return validateAndParse(IbisNodeSchema, data);
    } catch (error) {
      logger.error('IBIS node validation failed', { data, error });
      throw new ValidationError('Invalid IBIS node data format', 'ibis_node', {
        originalData: data,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
    }
  }

  // Validate user access code response
  static validateUserAccessCode(data: unknown): ReturnType<typeof UserAccessCodeSchema.parse> {
    try {
      return validateAndParse(UserAccessCodeSchema, data);
    } catch (error) {
      logger.error('User access code validation failed', { data, error });
      throw new ValidationError('Invalid user access code data format', 'user_access_code', {
        originalData: data,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
    }
  }

  // Validate array responses
  static validateUserArray(data: unknown): ReturnType<typeof UserSchema.parse>[] {
    if (!Array.isArray(data)) {
      throw new ValidationError('Expected array of users', 'users');
    }
    return data.map((item, index) => {
      try {
        return this.validateUser(item);
      } catch (error) {
        logger.error('User array validation failed', { index, item, error });
        throw new ValidationError(`Invalid user data at index ${index}`, 'users', {
          index,
          originalData: item,
          error: error instanceof Error ? error.message : 'Unknown validation error'
        });
      }
    });
  }

  static validateMessageArray(data: unknown): ReturnType<typeof MessageSchema.parse>[] {
    if (!Array.isArray(data)) {
      throw new ValidationError('Expected array of messages', 'messages');
    }
    return data.map((item, index) => {
      try {
        return this.validateMessage(item);
      } catch (error) {
        logger.error('Message array validation failed', { index, item, error });
        throw new ValidationError(`Invalid message data at index ${index}`, 'messages', {
          index,
          originalData: item,
          error: error instanceof Error ? error.message : 'Unknown validation error'
        });
      }
    });
  }

  static validateDeliberationArray(data: unknown): ReturnType<typeof DeliberationSchema.parse>[] {
    if (!Array.isArray(data)) {
      throw new ValidationError('Expected array of deliberations', 'deliberations');
    }
    return data.map((item, index) => {
      try {
        return this.validateDeliberation(item);
      } catch (error) {
        logger.error('Deliberation array validation failed', { index, item, error });
        throw new ValidationError(`Invalid deliberation data at index ${index}`, 'deliberations', {
          index,
          originalData: item,
          error: error instanceof Error ? error.message : 'Unknown validation error'
        });
      }
    });
  }

  // Validate paginated responses
  static validatePaginatedUsers(data: unknown) {
    const schema = PaginatedResponseSchema(UserSchema);
    try {
      return validateAndParse(schema, data);
    } catch (error) {
      logger.error('Paginated users validation failed', { data, error });
      throw new ValidationError('Invalid paginated users response format', 'paginated_users', {
        originalData: data,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
    }
  }

  static validatePaginatedMessages(data: unknown) {
    const schema = PaginatedResponseSchema(MessageSchema);
    try {
      return validateAndParse(schema, data);
    } catch (error) {
      logger.error('Paginated messages validation failed', { data, error });
      throw new ValidationError('Invalid paginated messages response format', 'paginated_messages', {
        originalData: data,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
    }
  }

  // Validate API responses with metadata
  static validateApiResponse<T>(data: unknown, dataValidator: (data: unknown) => T) {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Invalid API response format', 'api_response');
    }

    const response = data as Record<string, unknown>;
    
    // Check for error responses
    if (response.error) {
      const errorMessage = typeof response.error === 'string' 
        ? response.error 
        : (response.error as Record<string, unknown>)?.message || 'Unknown API error';
      throw new AppError(String(errorMessage), 'API_ERROR', {
        originalResponse: data
      });
    }

    // Validate success response
    if (response.data !== undefined) {
      try {
        return dataValidator(response.data);
      } catch (error) {
        logger.error('API response data validation failed', { 
          responseData: response.data, 
          error 
        });
        throw new ValidationError('Invalid API response data format', 'api_response_data', {
          originalData: response.data,
          error: error instanceof Error ? error.message : 'Unknown validation error'
        });
      }
    }

    // Direct data validation if no wrapper
    return dataValidator(data);
  }
}

// Type-safe fetch wrapper
export interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  validateResponse?: boolean;
}

export class TypeSafeFetch {
  private static readonly DEFAULT_TIMEOUT = 10000; // 10 seconds
  private static readonly DEFAULT_RETRIES = 3;

  static async request<T>(
    url: string,
    options: FetchOptions = {},
    validator?: (data: unknown) => T
  ): Promise<T> {
    const {
      timeout = this.DEFAULT_TIMEOUT,
      retries = this.DEFAULT_RETRIES,
      validateResponse = true,
      ...fetchOptions
    } = options;

    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...fetchOptions.headers,
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new AppError(
            `HTTP ${response.status}: ${response.statusText}`,
            'HTTP_ERROR',
            {
              status: response.status,
              statusText: response.statusText,
              url,
              responseBody: errorText,
            }
          );
        }

        const data = await response.json();

        if (validateResponse && validator) {
          return validator(data);
        }

        return data as T;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === retries) {
          logger.error('Request failed after all retries', {
            url,
            attempt: attempt + 1,
            error: lastError.message,
          });
          throw lastError;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        logger.warn('Request failed, retrying', {
          url,
          attempt: attempt + 1,
          retries,
          delay,
          error: lastError.message,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  // Convenience methods with built-in validators
  static async getUser(url: string, options?: FetchOptions) {
    return this.request(url, options, ApiValidator.validateUser);
  }

  static async getUsers(url: string, options?: FetchOptions) {
    return this.request(url, options, ApiValidator.validateUserArray);
  }

  static async getMessage(url: string, options?: FetchOptions) {
    return this.request(url, options, ApiValidator.validateMessage);
  }

  static async getMessages(url: string, options?: FetchOptions) {
    return this.request(url, options, ApiValidator.validateMessageArray);
  }

  static async getDeliberation(url: string, options?: FetchOptions) {
    return this.request(url, options, ApiValidator.validateDeliberation);
  }

  static async getDeliberations(url: string, options?: FetchOptions) {
    return this.request(url, options, ApiValidator.validateDeliberationArray);
  }

  static async getAgentConfiguration(url: string, options?: FetchOptions) {
    return this.request(url, options, ApiValidator.validateAgentConfiguration);
  }

  static async getIbisNode(url: string, options?: FetchOptions) {
    return this.request(url, options, ApiValidator.validateIbisNode);
  }
}

// Runtime type guards for additional safety
export const TypeGuards = {
  isString: (value: unknown): value is string => typeof value === 'string',
  isNumber: (value: unknown): value is number => typeof value === 'number' && !isNaN(value),
  isBoolean: (value: unknown): value is boolean => typeof value === 'boolean',
  isObject: (value: unknown): value is Record<string, unknown> => 
    value !== null && typeof value === 'object' && !Array.isArray(value),
  isArray: (value: unknown): value is unknown[] => Array.isArray(value),
  isUUID: (value: unknown): value is string => 
    typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  isEmail: (value: unknown): value is string =>
    typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  isURL: (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  isTimestamp: (value: unknown): value is string =>
    typeof value === 'string' && !isNaN(Date.parse(value)),
};

// Safe property access helpers
export const SafeAccess = {
  getString: (obj: unknown, path: string, defaultValue = ''): string => {
    const value = SafeAccess.getProperty(obj, path);
    return TypeGuards.isString(value) ? value : defaultValue;
  },

  getNumber: (obj: unknown, path: string, defaultValue = 0): number => {
    const value = SafeAccess.getProperty(obj, path);
    return TypeGuards.isNumber(value) ? value : defaultValue;
  },

  getBoolean: (obj: unknown, path: string, defaultValue = false): boolean => {
    const value = SafeAccess.getProperty(obj, path);
    return TypeGuards.isBoolean(value) ? value : defaultValue;
  },

  getArray: <T>(obj: unknown, path: string, defaultValue: T[] = []): T[] => {
    const value = SafeAccess.getProperty(obj, path);
    return TypeGuards.isArray(value) ? value as T[] : defaultValue;
  },

  getProperty: (obj: unknown, path: string): unknown => {
    if (!TypeGuards.isObject(obj)) return undefined;
    
    const keys = path.split('.');
    let current: unknown = obj;
    
    for (const key of keys) {
      if (!TypeGuards.isObject(current) || !(key in current)) {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  },
};