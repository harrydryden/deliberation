// Input sanitization utilities to prevent XSS and injection attacks

import DOMPurify from 'dompurify';

// Sanitize HTML content to prevent XSS
export const sanitizeHTML = (dirty: string): string => {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    ALLOWED_ATTR: ['class'],
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    USE_PROFILES: { html: true }
  });
};

// Sanitize plain text input
export const sanitizeText = (input: string): string => {
  return input
    .replace(/[<>&"']/g, (char) => {
      switch (char) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '"': return '&quot;';
        case "'": return '&#x27;';
        default: return char;
      }
    })
    .trim()
    .slice(0, 5000); // Limit length to prevent DoS
};

// Sanitize markdown content for safe rendering
export const sanitizeMarkdown = (markdown: string): string => {
  // Remove potentially dangerous markdown patterns
  return markdown
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/data:/gi, '') // Remove data: URLs
    .replace(/vbscript:/gi, '') // Remove VBScript
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '') // Remove iframes
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '') // Remove objects
    .replace(/<embed[^>]*>/gi, '') // Remove embeds
    .trim()
    .slice(0, 10000); // Limit length
};

// Validate and sanitize user input based on type
export const validateAndSanitizeInput = (
  input: string, 
  type: 'text' | 'html' | 'markdown' | 'email' | 'username'
): { valid: boolean; sanitized: string; error?: string } => {
  if (!input || typeof input !== 'string') {
    return { valid: false, sanitized: '', error: 'Invalid input' };
  }

  // Length validation
  const maxLengths = {
    text: 5000,
    html: 10000,
    markdown: 10000,
    email: 254,
    username: 100
  };

  if (input.length > maxLengths[type]) {
    return { valid: false, sanitized: '', error: `Input too long (max ${maxLengths[type]} characters)` };
  }

  let sanitized: string;
  
  switch (type) {
    case 'html':
      sanitized = sanitizeHTML(input);
      break;
    case 'markdown':
      sanitized = sanitizeMarkdown(input);
      break;
    case 'email':
      sanitized = input.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(sanitized)) {
        return { valid: false, sanitized: '', error: 'Invalid email format' };
      }
      break;
    case 'username':
      sanitized = input.trim().replace(/[^a-zA-Z0-9_-]/g, '');
      if (sanitized.length < 3) {
        return { valid: false, sanitized: '', error: 'Username too short (min 3 characters)' };
      }
      break;
    default:
      sanitized = sanitizeText(input);
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /javascript:/i,
    /vbscript:/i,
    /data:text\/html/i,
    /<script/i,
    /on\w+\s*=/i,
    /expression\s*\(/i
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      return { valid: false, sanitized: '', error: 'Potentially dangerous content detected' };
    }
  }

  return { valid: true, sanitized };
};

// Escape SQL-like content (for display purposes only - use parameterized queries for actual SQL)
export const escapeSQLForDisplay = (input: string): string => {
  return input.replace(/['";\\]/g, '\\$&');
};

// Sanitize chart data to prevent injection in chart components
export const sanitizeChartData = (data: any): any => {
  if (Array.isArray(data)) {
    return data.map(sanitizeChartData);
  }
  
  if (data && typeof data === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      const sanitizedKey = sanitizeText(key);
      if (typeof value === 'string') {
        sanitized[sanitizedKey] = sanitizeText(value);
      } else if (typeof value === 'number') {
        // Validate number is finite and not NaN
        sanitized[sanitizedKey] = Number.isFinite(value) ? value : 0;
      } else if (Array.isArray(value) || (value && typeof value === 'object')) {
        sanitized[sanitizedKey] = sanitizeChartData(value);
      } else {
        sanitized[sanitizedKey] = value;
      }
    }
    return sanitized;
  }
  
  return data;
};