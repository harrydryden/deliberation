import { formatAnonymizedTime, anonymizeTimestamp, ANONYMITY_CONFIG } from './anonymityUtils';

/**
 * Display timestamps with privacy-enhanced formatting
 */
export const formatMessageTime = (timestamp: string | Date): string => {
  if (!ANONYMITY_CONFIG.USE_PRECISE_TIMESTAMPS) {
    return formatAnonymizedTime(timestamp);
  }
  
  // Fallback to regular formatting if precise timestamps are enabled
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

/**
 * Format timestamps for anonymized display (rounded to hour)
 */
export const formatAnonymizedTimestamp = (timestamp: string | Date): string => {
  const anonymized = anonymizeTimestamp(timestamp);
  return new Date(anonymized).toLocaleString([], {
    month: 'short',
    day: 'numeric', 
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Show session activity status without precise timing
 */
export const formatSessionActivity = (recentlyActive: boolean): string => {
  return recentlyActive ? "Active now" : "Inactive";
};