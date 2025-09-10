import { useMemo } from 'react';
import type { ChatMessage } from "@/types/index";
import type { ViewMode } from "@/components/chat/ViewModeSelector";

export const useFilteredMessages = (
  messages: ChatMessage[], 
  viewMode: ViewMode, 
  currentUserId: string | undefined, 
  isAdmin: boolean = false
) => {
  return useMemo(() => {
    // Admin users see all messages regardless of view mode
    if (isAdmin) return messages;
    
    // For 'ibis' and 'table' view modes, show all messages (they display different content)
    if (viewMode !== 'chat') return messages;
    
    // For 'chat' view mode, filter to show only user's conversation thread
    if (!currentUserId) return messages;
    
    return messages.filter(msg => {
      // Include user's own messages (not submitted to IBIS - those are for IBIS context)
      if (msg.message_type === 'user' && msg.user_id === currentUserId && !msg.submitted_to_ibis) {
        return true;
      }
      
      // Include agent responses to user's messages
      if (msg.message_type !== 'user' && msg.parent_message_id) {
        const parentMessage = messages.find(m => m.id === msg.parent_message_id);
        return parentMessage?.user_id === currentUserId;
      }
      
      return false;
    });
  }, [messages, viewMode, currentUserId, isAdmin]);
};