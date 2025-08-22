// Frontend utilities for agent interactions
import type { AgentType, MessageType } from "@/types/index";

export const getAgentInfo = (messageType: MessageType) => {
  switch (messageType) {
    case 'bill_agent':
      return {
        name: 'Bill',
        icon: 'FileText',
        color: 'bg-blue-500',
        description: 'Policy & Legislative Analysis'
      };
    case 'flow_agent':
      return {
        name: 'Flo', 
        icon: 'Workflow',
        color: 'bg-green-500',
        description: 'Conversation Flow Management'
      };
    case 'peer_agent':
      return {
        name: 'Pia',
        icon: 'Users', 
        color: 'bg-purple-500',
        description: 'Peer Review & Analysis'
      };
    default:
      return {
        name: 'AI Assistant',
        icon: 'Bot',
        color: 'bg-gray-500', 
        description: 'General Assistant'
      };
  }
};