/**
 * Display timestamps with standard formatting
 */
export const formatMessageTime = (timestamp: string | Date): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

/**
 * Format timestamps for standard display
 */
export const formatTimestamp = (timestamp: string | Date): string => {
  return new Date(timestamp).toLocaleString([], {
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