// Enhanced security validation utilities
import { SECURITY_PATTERNS } from '@/config/security';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

// Enhanced input validation with security checks
export function validateInput(input: string, type: 'accessCode' | 'displayName' | 'email' | 'text'): ValidationResult {
  const errors: string[] = [];
  let sanitized = input.trim();
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // Advanced threat detection patterns
  const advancedThreats = {
    SQL_INJECTION_ADVANCED: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)|(';\s*--)|(\bor\s+1\s*=\s*1\b)/i,
    XSS_ADVANCED: /<\s*script[^>]*>|javascript:|on\w+\s*=|eval\s*\(|expression\s*\(/i,
    COMMAND_INJECTION: /(\||&|;|\$\(|\`|nc\s|wget\s|curl\s)/,
    PATH_TRAVERSAL: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/i,
    LDAP_INJECTION: /(\*|\(|\)|&|\||!|=|<|>|~|\/)/,
    XXE_ATTEMPT: /<!entity|<!doctype.*\[|<\?xml/i
  };

  // Check for advanced threats with risk scoring
  Object.entries(advancedThreats).forEach(([threatType, pattern]) => {
    if (pattern.test(input)) {
      errors.push(`Potential ${threatType.toLowerCase().replace(/_/g, ' ')} detected`);
      riskLevel = threatType.includes('INJECTION') ? 'critical' : 'high';
    }
  });

  // Check for common attack patterns
  if (SECURITY_PATTERNS.SQL_INJECTION.test(input)) {
    errors.push('Input contains potentially dangerous characters');
    riskLevel = 'high';
  }

  if (SECURITY_PATTERNS.XSS_ATTEMPT.test(input)) {
    errors.push('Input contains HTML/script tags');
    riskLevel = 'high';
  }

  // Type-specific validation with enhanced security
  switch (type) {
    case 'accessCode':
      if (!SECURITY_PATTERNS.ACCESS_CODE.test(input)) {
        errors.push('Access code must be 10 characters, letters and numbers only');
        riskLevel = 'medium';
      }
      // Check for common weak patterns
      if (/^(.)\1{9}$/.test(input)) { // All same character
        errors.push('Access code cannot be all the same character');
        riskLevel = 'medium';
      }
      if (/^(0123456789|abcdefghij|1234567890)$/i.test(input)) { // Sequential
        errors.push('Access code cannot be sequential');
        riskLevel = 'medium';
      }
      break;

    case 'displayName':
      if (!SECURITY_PATTERNS.DISPLAY_NAME.test(input)) {
        errors.push('Display name contains invalid characters');
        riskLevel = 'medium';
      }
      if (input.length > 100) {
        errors.push('Display name too long');
        riskLevel = 'medium';
      }
      // Check for impersonation attempts
      if (/\b(admin|administrator|root|system|support|help)\b/i.test(input)) {
        errors.push('Display name cannot impersonate system accounts');
        riskLevel = 'high';
      }
      break;

    case 'email':
      if (!SECURITY_PATTERNS.EMAIL.test(input)) {
        errors.push('Invalid email format');
        riskLevel = 'medium';
      }
      // Additional email security checks
      if (input.length > 254) { // RFC 5321 limit
        errors.push('Email address too long');
        riskLevel = 'medium';
      }
      // Check for dangerous email patterns
      if (/[<>"';&|`$(){}[\]\\]/g.test(input)) {
        errors.push('Email contains dangerous characters');
        riskLevel = 'high';
      }
      break;

    case 'text':
      if (!SECURITY_PATTERNS.SAFE_HTML.test(input)) {
        errors.push('Text contains potentially unsafe characters');
        riskLevel = 'medium';
      }
      // Enhanced text length limits with progressive warnings
      if (input.length > 10000) {
        errors.push('Text extremely long - potential DoS attempt');
        riskLevel = 'critical';
        sanitized = input.substring(0, 5000);
      } else if (input.length > 5000) {
        errors.push('Text too long');
        riskLevel = 'medium';
        sanitized = input.substring(0, 5000);
      }
      // Check for Base64 encoded content (potential malware)
      if (/^[A-Za-z0-9+/]+=*$/.test(input) && input.length > 100) {
        errors.push('Suspicious encoded content detected');
        riskLevel = 'high';
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : undefined,
    riskLevel
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

// Enhanced security event logging with risk assessment
export function logSecurityEvent(event: string, context: Record<string, any> = {}, riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'): void {
  const securityLog = {
    timestamp: new Date().toISOString(),
    event,
    context,
    userAgent: navigator.userAgent,
    url: window.location.href,
    sessionId: sessionStorage.getItem('session_id') || 'unknown',
    riskLevel,
    fingerprint: generateBrowserFingerprint()
  };

  // Different logging levels based on risk
  if (riskLevel === 'critical') {
    console.error('[SECURITY CRITICAL]', securityLog);
  } else if (riskLevel === 'high') {
    console.warn('[SECURITY HIGH]', securityLog);
  } else {
    console.info('[SECURITY]', securityLog);
  }
  
  // Store locally for pattern analysis
  storeSecurityEvent(securityLog);
  
  // In production, send to security monitoring service
  if (process.env.NODE_ENV === 'production') {
    // TODO: Send to security monitoring endpoint
    sendToSecurityMonitoring(securityLog);
  }
}

// Generate browser fingerprint for tracking
function generateBrowserFingerprint(): string {
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
    canvas: canvas.toDataURL()
  };
  
  return btoa(JSON.stringify(fingerprint)).substring(0, 16);
}

// Store security events locally for pattern analysis
function storeSecurityEvent(event: any): void {
  try {
    const events = JSON.parse(localStorage.getItem('security_events') || '[]');
    events.push(event);
    
    // Keep only last 100 events
    if (events.length > 100) {
      events.splice(0, events.length - 100);
    }
    
    localStorage.setItem('security_events', JSON.stringify(events));
  } catch (error) {
    console.warn('Failed to store security event:', error);
  }
}

// Send to security monitoring (placeholder for production implementation)
function sendToSecurityMonitoring(event: any): void {
  // This would integrate with your security monitoring service
  // For example: Sentry, DataDog, custom endpoint, etc.
  fetch('/api/security-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  }).catch(err => console.warn('Failed to send security event:', err));
}