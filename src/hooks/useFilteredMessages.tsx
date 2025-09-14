import { useMemo } from 'react';
import type { ChatMessage } from "@/types/index";
import type { ViewMode } from "@/components/chat/ViewModeSelector";
import { logger } from '@/utils/logger';

export const useFilteredMessages = (
  messages: ChatMessage[], 
  viewMode: ViewMode, 
  currentUserId: string | undefined, 
  isAdmin: boolean = false
) => {
  return useMemo(() => {
    // Safely handle undefined or null messages
    const safeMessages = messages || [];
    
    // Admin users see all messages regardless of view mode
    if (isAdmin) return safeMessages;
    
    // For 'ibis' and 'table' view modes, show all messages (they display different content)
    if (viewMode !== 'chat') return safeMessages;
    
    // For 'chat' view mode, filter to show only user's conversation thread
    if (!currentUserId) return safeMessages;
    
    
    const filtered = safeMessages.filter(msg => {
      // Include user's own messages (including those submitted to IBIS)
      if (msg.message_type === 'user' && msg.user_id === currentUserId) {
        return true;
      }
      
      // Include agent responses to user's messages
      if (msg.message_type !== 'user' && msg.parent_message_id) {
        const parentMessage = safeMessages.find(m => m.id === msg.parent_message_id);
        const shouldInclude = parentMessage?.user_id === currentUserId;
        
        return shouldInclude;
      }
      
      // Fallback: Include agent messages that might not have proper parent linking
      if (msg.message_type !== 'user' && !msg.parent_message_id) {
        // Check if this is the most recent agent message after a user message
        const messageIndex = safeMessages.findIndex(m => m.id === msg.id);
        if (messageIndex > 0) {
          const previousMessage = safeMessages[messageIndex - 1];
          const shouldInclude = previousMessage?.message_type === 'user' && previousMessage?.user_id === currentUserId;
          
          return shouldInclude;
        }
      }
      
      return false;
    });
    
    
    return filtered;
  }, [messages, viewMode, currentUserId, isAdmin]);
};