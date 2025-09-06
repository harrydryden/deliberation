/**
 * Date anonymization utilities for enhanced privacy
 */

import { formatAnonymizedTimestamp, formatSessionActivity } from './timeDisplay';
import { ANONYMITY_CONFIG } from './anonymityUtils';

/**
 * Apply anonymization to all date displays based on configuration
 */
export const getAnonymizedDateDisplay = (date: string | Date, context: 'message' | 'session' | 'general' = 'general'): string => {
  if (!ANONYMITY_CONFIG.USE_PRECISE_TIMESTAMPS) {
    switch (context) {
      case 'message':
        return formatAnonymizedTimestamp(date);
      case 'session':
        return formatAnonymizedTimestamp(date);
      default:
        return formatAnonymizedTimestamp(date);
    }
  }
  
  // Fallback to regular formatting if precise timestamps are enabled
  return new Date(date).toLocaleString();
};

/**
 * Replace all database query results with anonymized timestamps
 */
export const anonymizeQueryResults = <T extends Record<string, any>>(
  results: T[], 
  timestampFields: (keyof T)[] = ['created_at', 'updated_at']
): T[] => {
  if (ANONYMITY_CONFIG.USE_PRECISE_TIMESTAMPS) {
    return results; // Return as-is if precise timestamps are enabled
  }

  return results.map(result => {
    const anonymized = { ...result };
    timestampFields.forEach(field => {
      if (anonymized[field] && typeof anonymized[field] === 'string') {
        (anonymized[field] as any) = getAnonymizedDateDisplay(anonymized[field] as string);
      }
    });
    return anonymized;
  });
};