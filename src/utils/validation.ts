import { z } from 'zod';
import DOMPurify from 'dompurify';

// Enhanced input sanitization with XSS protection
export const sanitizeInput = (input: string): string => {
  return DOMPurify.sanitize(input.trim(), { ALLOWED_TAGS: [] });
};

// SQL injection prevention
export const sanitizeForDatabase = (input: string): string => {
  return input
    .trim()
    .replace(/['"\\;]/g, '') // Remove potential SQL injection characters
    .replace(/[<>]/g, '') // Remove potential XSS characters
    .substring(0, 5000); // Limit length
};

// Enhanced validation schemas with stricter security
export const accessCode1Schema = z.string()
  .length(5, 'Access code 1 must be exactly 5 characters')
  .regex(/^[A-Z]+$/, 'Access code 1 must contain only uppercase letters')
  .transform(val => val.toUpperCase().replace(/[^A-Z]/g, ''));

export const accessCode2Schema = z.string()
  .length(6, 'Access code 2 must be exactly 6 characters')
  .regex(/^\d+$/, 'Access code 2 must contain only digits');

export const displayNameSchema = z.string()
  .min(1, 'Display name is required')
  .max(100, 'Display name must be less than 100 characters')
  .regex(/^[a-zA-Z0-9\s\-_\.]+$/, 'Display name contains invalid characters')
  .transform(sanitizeInput);

export const bioSchema = z.string()
  .max(1000, 'Bio must be less than 1000 characters')
  .transform(sanitizeInput)
  .optional();

export const messageContentSchema = z.string()
  .min(1, 'Message content is required')
  .max(5000, 'Message content must be less than 5000 characters')
  .transform(sanitizeInput);

export const deliberationTitleSchema = z.string()
  .min(1, 'Title is required')
  .max(200, 'Title must be less than 200 characters')
  .regex(/^[a-zA-Z0-9\s\-_\.\,\!\?]+$/, 'Title contains invalid characters')
  .transform(sanitizeInput);

export const deliberationDescriptionSchema = z.string()
  .max(2000, 'Description must be less than 2000 characters')
  .transform(sanitizeInput)
  .optional();

// Admin role validation
export const userRoleSchema = z.enum(['admin', 'moderator', 'user']);

// Email validation for security
export const emailSchema = z.string()
  .email('Invalid email format')
  .max(254, 'Email too long')
  .transform(val => val.toLowerCase().trim());

// URL validation for safe redirects
export const urlSchema = z.string()
  .url('Invalid URL format')
  .max(2048, 'URL too long')
  .refine(url => {
    const allowed = ['http:', 'https:'];
    return allowed.includes(new URL(url).protocol);
  }, 'Only HTTP and HTTPS URLs are allowed');

// Fast validation utility
export const validateAndSanitize = <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } => {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return { success: false, error: 'Invalid input' };
  }
};

// Performance cache utilities
export const createCache = <T>(ttl: number = 5 * 60 * 1000) => {
  const cache = new Map<string, { data: T; expires: number }>();
  
  return {
    get: (key: string): T | null => {
      const item = cache.get(key);
      if (!item || Date.now() > item.expires) {
        cache.delete(key);
        return null;
      }
      return item.data;
    },
    set: (key: string, data: T): void => {
      cache.set(key, { data, expires: Date.now() + ttl });
    },
    clear: (): void => {
      cache.clear();
    }
  };
};

// Local storage cache for user data
export const userCache = {
  set: (userId: string, userData: any): void => {
    try {
      localStorage.setItem(`user_${userId}`, JSON.stringify({
        data: userData,
        timestamp: Date.now()
      }));
    } catch (e) {
      // Silent fail for performance
    }
  },
  
  get: (userId: string, maxAge: number = 5 * 60 * 1000): any | null => {
    try {
      const cached = localStorage.getItem(`user_${userId}`);
      if (!cached) return null;
      
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp > maxAge) {
        localStorage.removeItem(`user_${userId}`);
        return null;
      }
      
      return data;
    } catch (e) {
      return null;
    }
  },
  
  clear: (userId?: string): void => {
    try {
      if (userId) {
        localStorage.removeItem(`user_${userId}`);
      } else {
        // Clear all user cache
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('user_')) {
            localStorage.removeItem(key);
          }
        });
      }
    } catch (e) {
      // Silent fail
    }
  }
};