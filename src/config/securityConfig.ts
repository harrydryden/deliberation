// Centralized security configuration
export const SECURITY_CONFIG = {
  // Rate limiting configuration
  RATE_LIMITS: {
    AUTH_ATTEMPTS: {
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
      blockDurationMs: 30 * 60 * 1000 // 30 minutes
    },
    CRITICAL_OPS: {
      maxAttempts: 3,
      windowMs: 15 * 60 * 1000, // 15 minutes  
      blockDurationMs: 60 * 60 * 1000 // 1 hour
    },
    ADMIN_OPS: {
      maxAttempts: 10,
      windowMs: 60 * 1000, // 1 minute
      blockDurationMs: 5 * 60 * 1000 // 5 minutes
    }
  },

  // Session security
  SESSION: {
    maxDurationHours: 24,
    refreshThresholdMinutes: 15,
    maxConcurrentSessions: 3,
    enforceIpCheck: true,
    trackFingerprint: true
  },

  // Input validation thresholds
  VALIDATION: {
    maxInputLength: 5000,
    maxDisplayNameLength: 100,
    maxEmailLength: 254,
    accessCodeLength: 12, // Increased from 10 to 12 for better security
    strongPasswordMinLength: 12,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedFileTypes: [
      'application/pdf',
      'text/plain', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ]
  },

  // Security monitoring
  MONITORING: {
    logSecurityEvents: true,
    storeLocalEvents: true,
    maxLocalEvents: 100,
    alertThresholds: {
      criticalEventsPerHour: 5,
      highRiskEventsPerHour: 10,
      failedAuthAttemptsPerHour: 20,
      suspiciousFileUploads: 5,
      bruteForceThreshold: 3
    },
    quarantineThresholds: {
      maliciousFileDetection: true,
      suspiciousPatternDetection: true,
      rateLimitViolations: 10
    }
  },

  // Content Security Policy
  CSP: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https://iowsxuxkgvpgrvvklwyt.supabase.co"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'none'"],
    frameSrc: ["'none'"]
  },

  // Security headers
  HEADERS: {
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    xXssProtection: '1; mode=block',
    referrerPolicy: 'strict-origin-when-cross-origin',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains'
  }
};

// Security utility functions
export const SecurityUtils = {
  // Generate secure random string
  generateSecureToken: (length: number = 32): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomArray = new Uint8Array(length);
    crypto.getRandomValues(randomArray);
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(randomArray[i] % chars.length);
    }
    return result;
  },

  // Hash sensitive data for logging
  hashForLogging: (data: string): string => {
    return btoa(data).slice(0, 8) + '***';
  },

  // Check if running in secure context
  isSecureContext: (): boolean => {
    return window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost';
  },

  // Validate environment security
  validateEnvironment: (): { secure: boolean; warnings: string[] } => {
    const warnings: string[] = [];
    let secure = true;

    if (!SecurityUtils.isSecureContext()) {
      warnings.push('Application not running in secure context (HTTPS)');
      secure = false;
    }

    if (!window.crypto || !window.crypto.getRandomValues) {
      warnings.push('Crypto API not available');
      secure = false;
    }

    if (process.env.NODE_ENV === 'production' && location.hostname === 'localhost') {
      warnings.push('Production build running on localhost');
    }

    return { secure, warnings };
  },

  // Get client fingerprint for tracking
  getClientFingerprint: (): string => {
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screen: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      memory: (navigator as any).deviceMemory || 'unknown',
      cores: navigator.hardwareConcurrency || 'unknown'
    };

    return btoa(JSON.stringify(fingerprint)).slice(0, 16);
  },

  // Enhanced file validation with security scanning
  validateFileSecurely: (file: File): { valid: boolean; error?: string; riskLevel: string } => {
    if (!file) return { valid: false, error: 'No file provided', riskLevel: 'medium' };
    
    // Size validation
    if (file.size > SECURITY_CONFIG.VALIDATION.maxFileSize) {
      return { valid: false, error: 'File size exceeds limit', riskLevel: 'low' };
    }
    
    // Type validation
    if (!SECURITY_CONFIG.VALIDATION.allowedFileTypes.includes(file.type)) {
      return { valid: false, error: 'File type not allowed', riskLevel: 'high' };
    }
    
    // Filename security check
    const suspiciousPatterns = [
      /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i, /\.pif$/i,
      /\.com$/i, /\.dll$/i, /\.vbs$/i, /\.js$/i, /\.jar$/i,
      /[<>:"|?*]/,  // Invalid filename characters
      /^\./,        // Hidden files
      /\.{2,}/      // Multiple dots
    ];
    
    const isFilenameSuspicious = suspiciousPatterns.some(pattern => pattern.test(file.name));
    if (isFilenameSuspicious) {
      return { valid: false, error: 'Suspicious filename detected', riskLevel: 'critical' };
    }
    
    return { valid: true, riskLevel: 'low' };
  },

  // Detect potential injection attempts
  detectInjectionAttempt: (input: string): { detected: boolean; type?: string; riskLevel: string } => {
    const injectionPatterns = [
      { pattern: /<script[\s\S]*?>[\s\S]*?<\/script>/gi, type: 'xss', risk: 'high' },
      { pattern: /javascript:/gi, type: 'xss', risk: 'high' },
      { pattern: /on\w+\s*=/gi, type: 'xss', risk: 'medium' },
      { pattern: /(union|select|insert|update|delete|drop|create|alter|exec|execute)[\s\+]/gi, type: 'sql', risk: 'critical' },
      { pattern: /['";]/g, type: 'sql', risk: 'medium' },
      { pattern: /%3c|%3e|%22|%27/gi, type: 'encoded', risk: 'medium' }
    ];

    for (const { pattern, type, risk } of injectionPatterns) {
      if (pattern.test(input)) {
        return { detected: true, type, riskLevel: risk };
      }
    }

    return { detected: false, riskLevel: 'low' };
  }
};

// Security event types
export enum SecurityEventType {
  AUTH_SUCCESS = 'auth_success',
  AUTH_FAILURE = 'auth_failure',
  AUTH_RATE_LIMITED = 'auth_rate_limited',
  INVALID_INPUT = 'invalid_input',
  INJECTION_ATTEMPT = 'injection_attempt',
  SESSION_CREATED = 'session_created',
  SESSION_EXPIRED = 'session_expired',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SECURITY_HEADER_MISSING = 'security_header_missing'
}

// Risk levels
export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}