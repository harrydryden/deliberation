// Enhanced security validation utilities
import { SECURITY_PATTERNS } from '@/config/security';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: string;
}

// Enhanced input validation with security checks
export function validateInput(input: string, type: 'accessCode' | 'displayName' | 'email' | 'text'): ValidationResult {
  const errors: string[] = [];
  let sanitized = input.trim();

  // Check for common attack patterns
  if (SECURITY_PATTERNS.SQL_INJECTION.test(input)) {
    errors.push('Input contains potentially dangerous characters');
  }

  if (SECURITY_PATTERNS.XSS_ATTEMPT.test(input)) {
    errors.push('Input contains HTML/script tags');
  }

  // Type-specific validation
  switch (type) {
    case 'accessCode':
      if (!SECURITY_PATTERNS.ACCESS_CODE.test(input)) {
        errors.push('Access code must be 10 characters, letters and numbers only');
      }
      break;

    case 'displayName':
      if (!SECURITY_PATTERNS.DISPLAY_NAME.test(input)) {
        errors.push('Display name contains invalid characters');
      }
      if (input.length > 100) {
        errors.push('Display name too long');
      }
      break;

    case 'email':
      if (!SECURITY_PATTERNS.EMAIL.test(input)) {
        errors.push('Invalid email format');
      }
      break;

    case 'text':
      if (!SECURITY_PATTERNS.SAFE_HTML.test(input)) {
        errors.push('Text contains potentially unsafe characters');
      }
      // Limit text length for security
      if (input.length > 5000) {
        errors.push('Text too long');
        sanitized = input.substring(0, 5000);
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : undefined
  };
}

// Rate limiting tracker for security-sensitive operations
export class SecurityRateLimit {
  private attempts: Map<string, { count: number; lastAttempt: number; blockedUntil?: number }> = new Map();
  
  constructor(
    private maxAttempts: number = 3,
    private windowMs: number = 15 * 60 * 1000, // 15 minutes
    private blockDurationMs: number = 30 * 60 * 1000 // 30 minutes
  ) {}

  canAttempt(key: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record) {
      this.attempts.set(key, { count: 1, lastAttempt: now });
      return true;
    }

    // Check if still blocked
    if (record.blockedUntil && now < record.blockedUntil) {
      return false;
    }

    // Reset if window has passed
    if (now - record.lastAttempt > this.windowMs) {
      this.attempts.set(key, { count: 1, lastAttempt: now });
      return true;
    }

    // Check if under limit
    if (record.count < this.maxAttempts) {
      record.count++;
      record.lastAttempt = now;
      return true;
    }

    // Block user
    record.blockedUntil = now + this.blockDurationMs;
    return false;
  }

  getBlockedTime(key: string): number {
    const record = this.attempts.get(key);
    if (!record?.blockedUntil) return 0;
    
    const timeLeft = record.blockedUntil - Date.now();
    return Math.max(0, timeLeft);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

// Security-focused rate limiters
export const criticalOpRateLimit = new SecurityRateLimit(3, 15 * 60 * 1000, 30 * 60 * 1000); // Auth attempts
export const adminOpRateLimit = new SecurityRateLimit(5, 60 * 1000, 5 * 60 * 1000); // Admin operations

// Log security events with proper context
export function logSecurityEvent(event: string, context: Record<string, any> = {}): void {
  const securityLog = {
    timestamp: new Date().toISOString(),
    event,
    context,
    userAgent: navigator.userAgent,
    url: window.location.href,
    sessionId: sessionStorage.getItem('session_id') || 'unknown'
  };

  console.warn('[SECURITY]', securityLog);
  
  // In production, send to security monitoring service
  if (process.env.NODE_ENV === 'production') {
    // TODO: Send to security monitoring endpoint
  }
}