import { z } from 'zod';

// Input sanitization utilities
export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/[<>\"'&]/g, (match) => {
      const entityMap: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '&': '&amp;'
      };
      return entityMap[match] || match;
    });
};

// Access code validation
export const accessCodeSchema = z.string()
  .min(8, "Access code must be at least 8 characters")
  .max(15, "Access code must not exceed 15 characters")
  .regex(/^[A-Z0-9]+$/, "Access code must contain only uppercase letters and numbers");

// Profile validation schemas
export const displayNameSchema = z.string()
  .min(1, "Display name is required")
  .max(50, "Display name must not exceed 50 characters")
  .regex(/^[a-zA-Z0-9\s\-_\.]+$/, "Display name contains invalid characters");

export const bioSchema = z.string()
  .max(500, "Bio must not exceed 500 characters")
  .optional();

export const expertiseAreaSchema = z.string()
  .min(1, "Expertise area cannot be empty")
  .max(50, "Expertise area must not exceed 50 characters")
  .regex(/^[a-zA-Z0-9\s\-_\.]+$/, "Expertise area contains invalid characters");

// Message content validation
export const messageContentSchema = z.string()
  .min(1, "Message cannot be empty")
  .max(2000, "Message must not exceed 2000 characters");

// Deliberation validation schemas
export const deliberationTitleSchema = z.string()
  .min(1, "Title is required")
  .max(100, "Title must not exceed 100 characters");

export const deliberationDescriptionSchema = z.string()
  .max(1000, "Description must not exceed 1000 characters")
  .optional();

// Rate limiting helper
export const createRateLimiter = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, number[]>();
  
  return (identifier: string): boolean => {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!requests.has(identifier)) {
      requests.set(identifier, []);
    }
    
    const userRequests = requests.get(identifier)!;
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(time => time > windowStart);
    
    if (validRequests.length >= maxRequests) {
      return false; // Rate limit exceeded
    }
    
    validRequests.push(now);
    requests.set(identifier, validRequests);
    
    return true; // Request allowed
  };
};

// Validation utility functions
export const validateAndSanitize = <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } => {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation failed' };
    }
    return { success: false, error: 'Invalid input' };
  }
};

// URL validation for external links
export const urlSchema = z.string().url("Invalid URL format");

// File upload validation
export const fileUploadSchema = z.object({
  name: z.string().max(255, "Filename too long"),
  size: z.number().max(10 * 1024 * 1024, "File size must not exceed 10MB"), // 10MB limit
  type: z.string().regex(/^[a-zA-Z0-9\/\-\+\.]+$/, "Invalid file type")
});

// Password strength validation (if needed for future features)
export const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain uppercase, lowercase, and number");