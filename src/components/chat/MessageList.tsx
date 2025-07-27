import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bot, User, Users, Workflow, FileText, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatToUKTime } from "@/utils/timeUtils";

import type { ChatMessage } from "@/types/chat";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isTyping: boolean;
  onAddToIbis?: (messageId: string, content: string) => void;
}

const getAgentInfo = (messageType: string) => {
  switch (messageType) {
    case 'bill_agent':
      return {
        name: 'Bill',
        icon: FileText,
        color: 'bg-blue-500',
        description: 'Policy & Legislative Analysis'
      };
    case 'flow_agent':
      return {
        name: 'Flo',
        icon: Workflow,
        color: 'bg-green-500',
        description: 'Conversation Flow Management'
      };
    case 'peer_agent':
      return {
        name: 'Pia',
        icon: Users,
        color: 'bg-purple-500',
        description: 'Peer Review & Analysis'
      };
    default:
      return {
        name: 'AI Assistant',
        icon: Bot,
        color: 'bg-gray-500',
        description: 'General Assistant'
      };
  }
};

export const MessageList = ({ messages, isLoading, isTyping, onAddToIbis }: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Welcome to Democratic Deliberation</h3>
          <p>Start a conversation with our AI agents to explore ideas and engage in thoughtful dialogue.</p>
        </div>
      ) : (
        messages.map((message) => {
          const isUser = message.message_type === 'user';
          const agentInfo = isUser ? null : getAgentInfo(message.message_type);
          const AgentIcon = agentInfo?.icon || Bot;

          return (
            <div key={message.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className={isUser ? 'bg-democratic-blue' : agentInfo?.color}>
                  {isUser ? <User className="h-4 w-4 text-white" /> : <AgentIcon className="h-4 w-4 text-white" />}
                </AvatarFallback>
              </Avatar>
              
              <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">
                    {isUser ? 'You' : agentInfo?.name}
                  </span>
                  {!isUser && agentInfo?.description && (
                    <span className="text-xs text-muted-foreground">
                      {agentInfo.description}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatToUKTime(message.created_at)}
                  </span>
                </div>
                
                <Card className={`p-3 ${isUser ? 'bg-democratic-blue text-white' : 'bg-muted'}`}>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content}
                  </div>
                  
                  {/* Proactive engagement indicator */}
                  {!isUser && message.agent_context?.isProactive && (
                    <div className="mt-2 pt-2 border-t border-muted-foreground/20">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Workflow className="h-3 w-3" />
                        <span>Proactive facilitation</span>
                      </div>
                    </div>
                  )}
                  
                  {/* IBIS submission button - only for user messages */}
                  {onAddToIbis && isUser && !message.submitted_to_ibis && (
                    <div className="mt-2 pt-2 border-t border-muted-foreground/20">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAddToIbis(message.id, message.content)}
                        className="h-6 px-2 text-xs text-white hover:bg-white/20"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Submit
                      </Button>
                    </div>
                  )}
                  
                  {/* IBIS submitted indicator - only for user messages */}
                  {isUser && message.submitted_to_ibis && (
                    <div className="mt-2 pt-2 border-t border-muted-foreground/20">
                      <div className="flex items-center gap-2 text-xs text-white/80">
                        <FileText className="h-3 w-3" />
                        <span>Submitted to IBIS</span>
                      </div>
                    </div>
                  )}
                  
                </Card>
              </div>
            </div>
          );
        })
      )}
      
      {isTyping && (
        <div className="flex gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-gray-500">
              <Bot className="h-4 w-4 text-white" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="text-sm font-medium mb-1">AI is thinking...</div>
            <Card className="p-3 bg-muted">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </Card>
          </div>
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
};