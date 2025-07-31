import { z } from 'zod';

// Simplified validation for performance
export const sanitizeInput = (input: string): string => {
  return input.trim(); // Minimal sanitization
};

// Basic access code validation (performance focused)
export const accessCodeSchema = z.string()
  .regex(/^\d{10}$/, "Access code must be exactly 10 digits");

// Simplified profile validation
export const displayNameSchema = z.string()
  .min(1, "Display name is required")
  .max(100, "Display name too long");

export const bioSchema = z.string()
  .max(1000, "Bio too long")
  .optional();

// Basic message validation
export const messageContentSchema = z.string()
  .min(1, "Message cannot be empty")
  .max(5000, "Message too long");

// Simple deliberation validation
export const deliberationTitleSchema = z.string()
  .min(1, "Title is required")
  .max(200, "Title too long");

export const deliberationDescriptionSchema = z.string()
  .max(2000, "Description too long")
  .optional();

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