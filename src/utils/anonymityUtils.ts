/**
 * Utility functions for enhancing user anonymity and privacy
 */

// Generate anonymous identifiers that can't be traced back to users
export const generateAnonymousId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 9);
  return `anon_${timestamp}_${randomPart}`;
};

// Hash sensitive data for storage without exposing original values
export const hashForStorage = (data: string): string => {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
};

// Remove potentially identifying information from objects
export const sanitizeForLogging = (obj: Record<string, any>): Record<string, any> => {
  const sanitized = { ...obj };
  
  // Remove common PII fields
  const piiFields = [
    'email', 
    'user_agent', 
    'ip_address', 
    'userAgent', 
    'ipAddress',
    'phone', 
    'address', 
    'full_name',
    'fullName'
  ];
  
  piiFields.forEach(field => {
    if (sanitized[field]) {
      delete sanitized[field];
    }
  });
  
  return sanitized;
};

// Truncate timestamps to hour precision to reduce tracking granularity
export const anonymizeTimestamp = (timestamp: string | Date): string => {
  const date = new Date(timestamp);
  date.setMinutes(0, 0, 0); // Set minutes, seconds, and milliseconds to 0
  return date.toISOString();
};

// Configuration for anonymity settings
export const ANONYMITY_CONFIG = {
  // How long to keep detailed session data before anonymizing
  SESSION_RETENTION_DAYS: 30,
  
  // How often to run anonymization processes
  ANONYMIZATION_INTERVAL_HOURS: 24,
  
  // Whether to collect user agents (should be false for maximum anonymity)
  COLLECT_USER_AGENTS: false,
  
  // Whether to collect IP addresses (should be false for maximum anonymity)  
  COLLECT_IP_ADDRESSES: false,
  
  // Whether to use precise timestamps or rounded ones
  USE_PRECISE_TIMESTAMPS: false
} as const;

// Check if an operation should collect personal data based on anonymity settings
export const shouldCollectPersonalData = (dataType: keyof typeof ANONYMITY_CONFIG): boolean => {
  switch (dataType) {
    case 'COLLECT_USER_AGENTS':
      return ANONYMITY_CONFIG.COLLECT_USER_AGENTS;
    case 'COLLECT_IP_ADDRESSES':
      return ANONYMITY_CONFIG.COLLECT_IP_ADDRESSES;
    default:
      return false; // Default to not collecting personal data
  }
};

// Create anonymized user session data
export const createAnonymizedSession = (userId: string) => {
  return {
    user_id: userId,
    session_token_hash: generateAnonymousId(),
    is_active: true,
    // No user agent, IP address, or other identifying information
  };
};
