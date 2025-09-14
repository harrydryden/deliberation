// Security utilities for the application

// Rate limiting for client-side operations
export class ClientRateLimit {
  private attempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  
  constructor(
    private maxAttempts: number = 5,
    private windowMs: number = 15 * 60 * 1000 // 15 minutes
  ) {}
  
  canAttempt(key: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(key);
    
    if (!record) {
      this.attempts.set(key, { count: 1, lastAttempt: now });
      return true;
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
    
    return false;
  }
  
  getRemainingTime(key: string): number {
    const record = this.attempts.get(key);
    if (!record || record.count < this.maxAttempts) return 0;
    
    const timeLeft = this.windowMs - (Date.now() - record.lastAttempt);
    return Math.max(0, timeLeft);
  }
  
  reset(key: string): void {
    this.attempts.delete(key);
  }
}

// Authentication rate limiter - aligned with backend configuration  
export const authRateLimit = new ClientRateLimit(3, 15 * 60 * 1000); // 3 attempts per 15 minutes (critical security)

// Admin action rate limiter
export const adminRateLimit = new ClientRateLimit(10, 60 * 1000); // 10 attempts per minute

// CSRF protection
export const generateCSRFToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// Secure session management
export class SecureSession {
  private static readonly SESSION_KEY = 'secure_session';
  private static readonly MAX_AGE = 30 * 60 * 1000; // 30 minutes
  
  static setSession(data: any): void {
    const sessionData = {
      data,
      timestamp: Date.now(),
      csrfToken: generateCSRFToken()
    };
    
    try {
      sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionData));
    } catch (error) {
      // Session storage error handled silently
    }
  }
  
  static getSession(): any | null {
    try {
      const stored = sessionStorage.getItem(this.SESSION_KEY);
      if (!stored) return null;
      
      const sessionData = JSON.parse(stored);
      const age = Date.now() - sessionData.timestamp;
      
      if (age > this.MAX_AGE) {
        this.clearSession();
        return null;
      }
      
      return sessionData.data;
    } catch (error) {
      this.clearSession();
      return null;
    }
  }
  
  static clearSession(): void {
    try {
      sessionStorage.removeItem(this.SESSION_KEY);
    } catch (error) {
      // Session storage error handled silently
    }
  }
  
  static getCSRFToken(): string | null {
    try {
      const stored = sessionStorage.getItem(this.SESSION_KEY);
      if (!stored) return null;
      
      const sessionData = JSON.parse(stored);
      return sessionData.csrfToken || null;
    } catch (error) {
      return null;
    }
  }
}

// Content Security Policy helpers
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'https:'],
  'connect-src': ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"]
};

// Security headers for client-side requests
export const getSecurityHeaders = (): Record<string, string> => {
  const csrfToken = SecureSession.getCSRFToken();
  
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...(csrfToken && { 'X-CSRF-Token': csrfToken })
  };
};

// Input validation utilities
export const validateFileUpload = (file: File): { valid: boolean; error?: string } => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];
  
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 10MB limit' };
  }
  
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'File type not allowed' };
  }
  
  // Check for suspicious file names
  if (/[<>:"|?*]/.test(file.name)) {
    return { valid: false, error: 'Invalid characters in filename' };
  }
  
  return { valid: true };
};

// Secure URL validation
export const isValidRedirectURL = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const allowedOrigins = [
      window.location.origin
    ];
    
    return allowedOrigins.includes(parsed.origin);
  } catch {
    return false;
  }
};

// Log security events
export const logSecurityEvent = (event: string, details?: any): void => {
  // In production, send to monitoring service
  if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'production') {
    // Send to monitoring service - structured logging
    // Production security events would go to external service
  }
};