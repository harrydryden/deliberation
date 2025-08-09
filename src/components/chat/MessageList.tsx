import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bot, User, Users, Workflow, FileText, Plus, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatToUKTime } from "@/utils/timeUtils";
import { MarkdownMessage } from "@/components/common/MarkdownMessage";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import type { ChatMessage } from "@/types/chat";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isTyping: boolean;
  onAddToIbis?: (messageId: string, content: string) => void;
  onRetry?: (id: string, content: string) => void;
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

export const MessageList = ({ messages, isLoading, isTyping, onAddToIbis, onRetry }: MessageListProps) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unreadIndex, setUnreadIndex] = useState<number | null>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!atBottom && messages.length > prevCountRef.current) {
      setUnreadIndex(prevCountRef.current);
    }
    prevCountRef.current = messages.length;
  }, [messages.length, atBottom]);

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4">
        {[...Array(5)].map((_, i) => (
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
    <div className="relative h-full overflow-hidden p-4">
      {messages.length === 0 && !isTyping ? (
        <div className="text-center text-muted-foreground py-12">
          <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Welcome to Democratic Deliberation</h3>
          <p>Start a conversation with our AI agents to explore ideas and engage in thoughtful dialogue.</p>
        </div>
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          className="h-full"
          data={messages}
          followOutput={"smooth"}
          atBottomStateChange={setAtBottom}
          itemContent={(index, message) => {
            const isUser = message.message_type === 'user';
            const agentInfo = isUser ? null : getAgentInfo(message.message_type);
            const AgentIcon = agentInfo?.icon || Bot;

            return (
              <div>
                {unreadIndex !== null && index === unreadIndex && (
                  <div className="my-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">Unread</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}

                <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
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
                      <div className="text-sm leading-relaxed">
                        <MarkdownMessage 
                          content={message.content} 
                          className={isUser ? 'prose-invert' : ''}
                        />
                      </div>

                      {!isUser && message.agent_context?.isProactive && (
                        <div className="mt-2 pt-2 border-t border-muted-foreground/20">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Workflow className="h-3 w-3" />
                            <span>Proactive facilitation</span>
                          </div>
                        </div>
                      )}

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

                      {isUser && message.submitted_to_ibis && (
                        <div className="mt-2 pt-2 border-t border-muted-foreground/20">
                          <div className="flex items-center gap-2 text-xs text-white/80">
                            <FileText className="h-3 w-3" />
                            <span>Submitted to IBIS</span>
                          </div>
                        </div>
                      )}

                      {isUser && message.status === 'pending' && (
                        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-white/90">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Sending…</span>
                        </div>
                      )}

                      {isUser && message.status === 'failed' && (
                        <div className="mt-2 flex items-center justify-end gap-2 text-xs">
                          <span className="text-destructive">Failed</span>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => onRetry?.(message.id, message.content)}
                          >
                            Retry
                          </Button>
                        </div>
                      )}

                    </Card>
                  </div>
                </div>
              </div>
            );
          }}
          components={{
            Footer: () => (
              isTyping ? (
                <div className="flex gap-3 mt-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gray-500">
                      <Bot className="h-4 w-4 text-white" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="text-sm font-medium mb-1">Deliberating...</div>
                    <Card className="p-3 bg-muted">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </Card>
                  </div>
                </div>
              ) : (<div />)
            ),
          }}
        />
      )}

      {!atBottom && messages.length > 0 && (
        <div className="absolute right-4 bottom-28 md:bottom-24 lg:bottom-20 z-20">
          <Button
            variant="default"
            onClick={() => {
              virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: 'end', behavior: 'smooth' });
              setUnreadIndex(null);
            }}
          >
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
};