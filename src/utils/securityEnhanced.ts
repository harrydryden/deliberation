// Enhanced security utilities with comprehensive validation and monitoring

import { supabase } from '@/integrations/supabase/client';

/**
 * Enhanced input validation with security threat detection
 */
export interface SecurityValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  threats: string[];
}

/**
 * Comprehensive input validation with advanced threat detection
 */
export function validateInputSecure(
  input: string, 
  type: 'accessCode' | 'displayName' | 'email' | 'text'
): SecurityValidationResult {
  const errors: string[] = [];
  const threats: string[] = [];
  let sanitized = input.trim();
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // Advanced threat detection patterns
  const threatPatterns = {
    SQL_INJECTION: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)|(';\s*--)|(\bor\s+1\s*=\s*1\b)/i,
    XSS_SCRIPT: /<\s*script[^>]*>|javascript:|on\w+\s*=|\beval\s*\(|expression\s*\(/i,
    XSS_HTML: /<\s*(iframe|object|embed|form|input|img)[^>]*>/i,
    COMMAND_INJECTION: /(\||&|;|\$\(|`|nc\s|wget\s|curl\s|rm\s|cat\s)/,
    PATH_TRAVERSAL: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/i,
    LDAP_INJECTION: /(\*|\(|\)|&|\||!|=|<|>|~|\/)/,
    XXE_ATTEMPT: /<!entity|<!doctype.*\[|<\?xml/i,
    TEMPLATE_INJECTION: /\{\{.*\}\}|\$\{.*\}/,
    NOSQL_INJECTION: /[\$\{\}]/,
    CSRF_TOKEN_PATTERN: /csrf[_-]?token/i
  };

  // Check for threats with risk scoring
  Object.entries(threatPatterns).forEach(([threatType, pattern]) => {
    if (pattern.test(input)) {
      threats.push(threatType.toLowerCase().replace(/_/g, ' '));
      errors.push(`Potential ${threatType.toLowerCase().replace(/_/g, ' ')} detected`);
      
      if (threatType.includes('INJECTION') || threatType.includes('XSS')) {
        riskLevel = 'critical';
      } else if (threatType.includes('TRAVERSAL') || threatType.includes('COMMAND')) {
        riskLevel = 'high';
      } else if (riskLevel !== 'critical' && riskLevel !== 'high') {
        riskLevel = 'medium';
      }
    }
  });

  // Type-specific validation
  switch (type) {
    case 'accessCode':
      if (!/^[A-Z0-9]{8,15}$/.test(input)) {
        errors.push('Access code must be 8-15 characters, letters and numbers only');
        if (riskLevel === 'low') riskLevel = 'medium';
      }
      // Check for weak patterns
      if (/^(.)\1{7,}$/.test(input)) {
        errors.push('Access code cannot be repetitive');
        threats.push('weak pattern');
        riskLevel = 'medium';
      }
      break;

    case 'displayName':
      if (!/^[a-zA-Z0-9\s\-_\\.]{1,100}$/.test(input)) {
        errors.push('Display name contains invalid characters');
        riskLevel = 'medium';
      }
      // Check for impersonation attempts
      if (/\b(admin|administrator|root|system|support|help|mod|moderator)\b/i.test(input)) {
        errors.push('Display name cannot impersonate system accounts');
        threats.push('impersonation attempt');
        riskLevel = 'high';
      }
      break;

    case 'email':
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(input)) {
        errors.push('Invalid email format');
        riskLevel = 'medium';
      }
      if (input.length > 254) {
        errors.push('Email address too long');
        riskLevel = 'medium';
      }
      break;

    case 'text':
      // Enhanced text validation
      if (input.length > 50000) {
        errors.push('Text extremely long - potential DoS attempt');
        threats.push('denial of service');
        riskLevel = 'critical';
        sanitized = input.substring(0, 10000);
      } else if (input.length > 10000) {
        errors.push('Text too long');
        riskLevel = 'medium';
        sanitized = input.substring(0, 10000);
      }
      
      // Check for suspicious encoded content
      if (/^[A-Za-z0-9+/]+=*$/.test(input) && input.length > 100) {
        errors.push('Suspicious encoded content detected');
        threats.push('potential malware');
        riskLevel = 'high';
      }
      break;
  }

  // Log security events for threats
  if (threats.length > 0) {
    logSecurityThreat('input_validation_threat', {
      input_type: type,
      threats: threats,
      risk_level: riskLevel,
      sanitized_length: sanitized.length
    }, riskLevel);
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : undefined,
    riskLevel,
    threats
  };
}

/**
 * Enhanced rate limiting with progressive penalties
 */
export class EnhancedRateLimit {
  private attempts: Map<string, { 
    count: number; 
    lastAttempt: number; 
    blockedUntil?: number;
    violations: number;
  }> = new Map();
  
  constructor(
    private maxAttempts: number = 3,
    private windowMs: number = 15 * 60 * 1000, // 15 minutes
    private blockDurationMs: number = 30 * 60 * 1000 // 30 minutes
  ) {}

  canAttempt(key: string): { allowed: boolean; remainingTime?: number; violations?: number } {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record) {
      this.attempts.set(key, { count: 1, lastAttempt: now, violations: 0 });
      return { allowed: true };
    }

    // Check if still blocked
    if (record.blockedUntil && now < record.blockedUntil) {
      return { 
        allowed: false, 
        remainingTime: record.blockedUntil - now,
        violations: record.violations
      };
    }

    // Reset if window has passed
    if (now - record.lastAttempt > this.windowMs) {
      record.count = 1;
      record.lastAttempt = now;
      record.blockedUntil = undefined;
      return { allowed: true, violations: record.violations };
    }

    // Check if under limit
    if (record.count < this.maxAttempts) {
      record.count++;
      record.lastAttempt = now;
      return { allowed: true, violations: record.violations };
    }

    // Block user with progressive penalties
    record.violations++;
    const penaltyMultiplier = Math.min(record.violations, 5); // Cap at 5x penalty
    record.blockedUntil = now + (this.blockDurationMs * penaltyMultiplier);
    
    // Log security event for repeated violations
    logSecurityThreat('rate_limit_violation', {
      key,
      violations: record.violations,
      penalty_multiplier: penaltyMultiplier,
      blocked_until: new Date(record.blockedUntil)
    }, record.violations > 3 ? 'critical' : 'high');

    return { 
      allowed: false, 
      remainingTime: record.blockedUntil - now,
      violations: record.violations
    };
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

/**
 * Security-focused rate limiters with enhanced monitoring
 */
export const authRateLimit = new EnhancedRateLimit(3, 15 * 60 * 1000, 30 * 60 * 1000);
export const adminRateLimit = new EnhancedRateLimit(5, 60 * 1000, 5 * 60 * 1000);
export const apiRateLimit = new EnhancedRateLimit(100, 60 * 1000, 60 * 1000);

/**
 * Secure session management with enhanced validation
 */
export class SecureSessionManager {
  private static readonly SESSION_KEY = 'secure_session';
  private static readonly MAX_AGE = 30 * 60 * 1000; // 30 minutes
  private static readonly CSRF_KEY = 'csrf_token';

  static async createSession(data: any): Promise<string> {
    const csrfToken = this.generateCSRFToken();
    const sessionData = {
      data,
      timestamp: Date.now(),
      csrfToken,
      fingerprint: await this.generateFingerprint()
    };
    
    try {
      const encrypted = await this.encryptSessionData(sessionData);
      sessionStorage.setItem(this.SESSION_KEY, encrypted);
      localStorage.setItem(this.CSRF_KEY, csrfToken);
      return csrfToken;
    } catch (error) {
      logSecurityThreat('session_creation_failed', { error: error.message }, 'high');
      throw new Error('Failed to create secure session');
    }
  }

  static async getSession(): Promise<any | null> {
    try {
      const stored = sessionStorage.getItem(this.SESSION_KEY);
      if (!stored) return null;
      
      const sessionData = await this.decryptSessionData(stored);
      const age = Date.now() - sessionData.timestamp;
      
      if (age > this.MAX_AGE) {
        this.clearSession();
        logSecurityThreat('session_expired', { age }, 'low');
        return null;
      }

      // Validate session fingerprint
      const currentFingerprint = await this.generateFingerprint();
      if (sessionData.fingerprint !== currentFingerprint) {
        this.clearSession();
        logSecurityThreat('session_fingerprint_mismatch', {}, 'high');
        return null;
      }
      
      return sessionData.data;
    } catch (error) {
      this.clearSession();
      logSecurityThreat('session_validation_failed', { error: error.message }, 'medium');
      return null;
    }
  }

  static clearSession(): void {
    try {
      sessionStorage.removeItem(this.SESSION_KEY);
      localStorage.removeItem(this.CSRF_KEY);
    } catch (error) {
      console.warn('Failed to clear session:', error);
    }
  }

  static getCSRFToken(): string | null {
    return localStorage.getItem(this.CSRF_KEY);
  }

  private static generateCSRFToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private static async generateFingerprint(): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Security fingerprint', 2, 2);
    }
    
    const fingerprint = {
      screen: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform,
      canvas: canvas.toDataURL(),
      userAgent: navigator.userAgent.substring(0, 100) // Truncate for storage
    };
    
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(fingerprint));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  private static async encryptSessionData(data: any): Promise<string> {
    // Simple base64 encoding for now - in production, use proper encryption
    return btoa(JSON.stringify(data));
  }

  private static async decryptSessionData(encryptedData: string): Promise<any> {
    // Simple base64 decoding for now - in production, use proper decryption
    return JSON.parse(atob(encryptedData));
  }
}

/**
 * Enhanced security event logging with automatic threat response
 */
export async function logSecurityThreat(
  eventType: string, 
  details: Record<string, any> = {}, 
  riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): Promise<void> {
  const securityEvent = {
    timestamp: new Date().toISOString(),
    event_type: eventType,
    details,
    user_agent: navigator.userAgent,
    url: window.location.href,
    session_id: sessionStorage.getItem('session_id') || 'unknown',
    risk_level: riskLevel,
    fingerprint: await SecureSessionManager['generateFingerprint']()
  };

  // Log to console based on risk level
  if (riskLevel === 'critical') {
    console.error('[SECURITY CRITICAL]', securityEvent);
  } else if (riskLevel === 'high') {
    console.warn('[SECURITY HIGH]', securityEvent);
  } else {
    console.info('[SECURITY]', securityEvent);
  }
  
  // Store locally for pattern analysis
  storeSecurityEvent(securityEvent);
  
  // Send to backend for critical/high risk events
  if (riskLevel === 'critical' || riskLevel === 'high') {
    try {
      await supabase.functions.invoke('log-security-event', {
        body: securityEvent
      });
    } catch (error) {
      console.warn('Failed to send security event to backend:', error);
    }
  }
}

/**
 * Store security events locally for pattern analysis
 */
function storeSecurityEvent(event: any): void {
  try {
    const events = JSON.parse(localStorage.getItem('security_events') || '[]');
    events.push(event);
    
    // Keep only last 50 events
    if (events.length > 50) {
      events.splice(0, events.length - 50);
    }
    
    localStorage.setItem('security_events', JSON.stringify(events));
  } catch (error) {
    console.warn('Failed to store security event:', error);
  }
}

/**
 * Content Security Policy helper
 */
export function enforceCSP(): void {
  // Add CSP meta tag if not present
  if (!document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
    const meta = document.createElement('meta');
    meta.setAttribute('http-equiv', 'Content-Security-Policy');
    meta.setAttribute('content', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://*.supabase.co; " +
      "object-src 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'; " +
      "frame-ancestors 'none'"
    );
    document.head.appendChild(meta);
  }
}

/**
 * Initialize security monitoring
 */
export function initializeSecurity(): void {
  // Enforce CSP
  enforceCSP();
  
  // Monitor for suspicious activity
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('javascript:')) {
      event.preventDefault();
      logSecurityThreat('javascript_url_blocked', { href: target.getAttribute('href') }, 'high');
    }
  });
  
  // Monitor for console access (potential XSS)
  let consoleAccessCount = 0;
  const originalLog = console.log;
  console.log = function(...args) {
    consoleAccessCount++;
    if (consoleAccessCount > 10) {
      logSecurityThreat('excessive_console_access', { count: consoleAccessCount }, 'medium');
    }
    return originalLog.apply(console, args);
  };
  
  console.info('[SECURITY] Enhanced security monitoring initialized');
}
