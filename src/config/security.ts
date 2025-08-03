// Security configuration for the application

export const SECURITY_CONFIG = {
  // Rate limiting
  AUTH_RATE_LIMIT: {
    maxAttempts: 3,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  
  ADMIN_RATE_LIMIT: {
    maxAttempts: 10,
    windowMs: 60 * 1000, // 1 minute
  },
  
  // Session management
  SESSION: {
    maxAge: 30 * 60 * 1000, // 30 minutes
    renewThreshold: 5 * 60 * 1000, // Renew if less than 5 minutes left
  },
  
  // File upload security
  FILE_UPLOAD: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ],
    scanTimeout: 30 * 1000, // 30 seconds
  },
  
  // Input validation
  VALIDATION: {
    maxInputLength: 5000,
    accessCodeLength: 10,
    maxDisplayNameLength: 100,
    maxBioLength: 1000,
    maxTitleLength: 200,
    maxDescriptionLength: 2000,
  },
  
  // Content Security Policy
  CSP: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'", 'https://*.supabase.co'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"]
  },
  
  // Security headers
  SECURITY_HEADERS: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  },
  
  // Allowed redirect URLs
  ALLOWED_ORIGINS: [
    'https://95847591-350e-48fd-8530-0c2bb5de6650.lovableproject.com',
  ],
  
  // Audit logging
  AUDIT: {
    sensitiveActions: [
      'user_role_change',
      'access_code_creation',
      'deliberation_creation',
      'user_deletion',
      'bulk_operations'
    ],
    retentionDays: 90,
  }
};

// Security validation patterns
export const SECURITY_PATTERNS = {
  ACCESS_CODE: /^[A-Z0-9]{10}$/,
  DISPLAY_NAME: /^[a-zA-Z0-9\s\-_\.]{1,100}$/,
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  SAFE_HTML: /^[a-zA-Z0-9\s\-_\.\,\!\?\:\;\"\']*$/,
  SQL_INJECTION: /['"\\;]/,
  XSS_ATTEMPT: /[<>]/,
};

// Environment-specific security settings
export const getSecurityConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    ...SECURITY_CONFIG,
    // Stricter in production
    AUTH_RATE_LIMIT: {
      ...SECURITY_CONFIG.AUTH_RATE_LIMIT,
      maxAttempts: isProduction ? 3 : 5,
    },
    // Enhanced logging in production
    enableSecurityLogging: isProduction,
    enablePerformanceMonitoring: isProduction,
  };
};