import React, { useEffect, useRef, useState, useCallback, lazy, Suspense, memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bot, User, Users, Workflow, FileText, Plus, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMessageTime } from '@/utils/timeDisplay';
const LazyMarkdownMessage = lazy(() => import("@/components/common/MarkdownMessage").then(m => ({ default: m.MarkdownMessage })));
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import type { ChatMessage } from "@/types/index";
import { AgentConfig } from "@/types/common";
import SimilarIbisNodes from "@/components/chat/SimilarIbisNodes";
import { MessageRating } from "@/components/chat/MessageRating";
import { usePerformanceOptimization } from "@/hooks/usePerformanceOptimization";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isTyping: boolean;
  onAddToIbis?: (messageId: string, content: string) => void;
  onRetry?: (id: string, content: string) => void;
  deliberationId?: string;
  agentConfigs?: AgentConfig[];
}

const AGENTS = {
  bill_agent: {
    name: 'Bill',
    icon: FileText,
    color: 'bg-bill-agent',
    bgColor: 'bg-bill-agent-bg',
    description: 'Policy & Legislative Analysis'
  },
  flow_agent: {
    name: 'Flo',
    icon: Workflow,
    color: 'bg-flow-agent',
    bgColor: 'bg-flow-agent-bg',
    description: 'Conversation Flow Management'
  },
  peer_agent: {
    name: 'Pia',
    icon: Users,
    color: 'bg-peer-agent',
    bgColor: 'bg-peer-agent-bg',
    description: 'Peer Review & Analysis'
  },
  default: {
    name: 'AI Assistant',
    icon: Bot,
    color: 'bg-muted-foreground',
    bgColor: 'bg-muted',
    description: 'General Assistant'
  }
} as const;

// Optimized message item with proper memoization
const OptimizedMessageItem = memo(({ 
  message, 
  index, 
  unreadIndex, 
  onAddToIbis, 
  onRetry, 
  agentConfigsMap, 
  deliberationId 
}: { 
  message: ChatMessage;
  index: number;
  unreadIndex: number | null;
  onAddToIbis?: (messageId: string, content: string) => void;
  onRetry?: (id: string, content: string) => void;
  agentConfigsMap: Map<string, AgentConfig>;
  deliberationId?: string;
}) => {
  const isUser = message.message_type === 'user';
  
  // Optimized agent config lookup with proper typing
  const agentConfig = useMemo(() => 
    agentConfigsMap.get(message.message_type), 
    [agentConfigsMap, message.message_type]
  );
  
  const fallbackAgentInfo = useMemo(() => {
    const agentKey = message.message_type as keyof typeof AGENTS;
    return AGENTS[agentKey] ?? AGENTS.default;
  }, [message.message_type]);
  
  const agentInfo = useMemo(() => isUser ? null : {
    ...fallbackAgentInfo,
    name: agentConfig?.name || fallbackAgentInfo.name,
    description: agentConfig?.description || fallbackAgentInfo.description
  }, [isUser, agentConfig, fallbackAgentInfo]);
  
  const AgentIcon = (agentInfo?.icon) || Bot;

  const handleAddToIbis = useCallback(() => {
    onAddToIbis?.(message.id, message.content);
  }, [onAddToIbis, message.id, message.content]);

  const handleRetry = useCallback(() => {
    onRetry?.(message.id, message.content);
  }, [onRetry, message.id, message.content]);

  return (
    <div className="pb-4" style={{ minHeight: '80px' }}>
      {unreadIndex !== null && index === unreadIndex && (
        <div className="my-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">Unread</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className={isUser ? 'bg-user-message' : agentInfo?.color}>
            {isUser ? <User className="h-4 w-4 text-white" /> : <AgentIcon className="h-4 w-4 text-white" />}
          </AvatarFallback>
        </Avatar>

        <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
          <div className={`flex items-center gap-2 mb-1 ${isUser ? 'justify-end' : ''}`}>
            <span className={`text-sm font-semibold ${isUser ? 'text-muted-foreground' : 'text-foreground'}`}>
              {isUser ? 'You' : agentInfo?.name}
            </span>
            {!isUser && agentInfo?.description && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {agentInfo.description}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatMessageTime(message.created_at)}
            </span>
          </div>

          <Card className={`p-3 transition-all duration-200 ${isUser ? 'bg-user-message text-white' : agentInfo?.bgColor || 'bg-muted'}`}>
            <div className="text-sm leading-relaxed">
              <Suspense fallback={<div className="h-6 w-32 bg-muted rounded animate-pulse" />}> 
                <LazyMarkdownMessage 
                  content={message.content} 
                  className={isUser ? 'prose-invert' : ''}
                />
              </Suspense>
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
                  onClick={handleAddToIbis}
                  className="h-6 px-2 text-xs text-white hover:bg-white/20"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Share
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
                  onClick={handleRetry}
                >
                  Retry
                </Button>
              </div>
            )}

            {!isUser && (
              <div className="mt-2 pt-2 border-t border-muted-foreground/20">
                <MessageRating
                  messageId={message.id}
                  messageType={message.message_type}
                  className="justify-start"
                />
              </div>
            )}
          </Card>

          {!isUser && message.agent_context?.similar_nodes && (
            <SimilarIbisNodes
              nodes={message.agent_context.similar_nodes}
              messageId={message.id}
              deliberationId={deliberationId}
            />
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) => 
  prev.message.id === next.message.id && 
  prev.message.content === next.message.content &&
  prev.message.status === next.message.status &&
  prev.unreadIndex === next.unreadIndex &&
  prev.index === next.index
);

export const OptimizedMessageList = memo(({ 
  messages, 
  isLoading, 
  isTyping, 
  onAddToIbis, 
  onRetry, 
  deliberationId, 
  agentConfigs 
}: MessageListProps) => {
  console.log('OptimizedMessageList render:', {
    messagesLength: messages?.length || 0,
    isLoading,
    isTyping,
    messages: messages?.map(m => ({ id: m.id, type: m.message_type, content: m.content?.substring(0, 30) }))
  });

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unreadIndex, setUnreadIndex] = useState<number | null>(null);
  const prevCountRef = useRef(0);
  const didAutoScrollRef = useRef(false);
  
  // Performance optimization hooks
  const { createOptimizedCallback, createOptimizedMemo } = usePerformanceOptimization({
    componentName: 'OptimizedMessageList',
    enableLogging: false, // Disable logging to reduce overhead
    memoryThreshold: 100 // Higher threshold
  });

  // Optimized agent configs map with proper typing and stability check
  const agentConfigsMap = useMemo(() => {
    const map = new Map<string, AgentConfig>();
    agentConfigs?.forEach(config => {
      map.set(config.agent_type, config);
    });
    return map;
  }, [agentConfigs?.length, agentConfigs?.map(c => c.agent_type).join(',')]);  // More stable dependencies

  // Optimize renderItem with stable dependencies
  const renderItem = createOptimizedCallback(
    (index: number, message: ChatMessage) => {
      return (
        <OptimizedMessageItem
          message={message}
          index={index}
          unreadIndex={unreadIndex}
          onAddToIbis={onAddToIbis}
          onRetry={onRetry}
          agentConfigsMap={agentConfigsMap}
          deliberationId={deliberationId}
        />
      );
    },
    [unreadIndex, onAddToIbis, onRetry, agentConfigsMap, deliberationId],
    'renderItem'
  );

  // Auto-scroll optimization
  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ 
      index: messages.length - 1, 
      align: 'end', 
      behavior: 'smooth' 
    });
    setUnreadIndex(null);
  }, [messages.length]);

  useEffect(() => {
    if (!atBottom && messages.length > prevCountRef.current) {
      setUnreadIndex(prevCountRef.current);
    }
    prevCountRef.current = messages.length;
  }, [messages.length, atBottom]);

  useEffect(() => {
    if (!didAutoScrollRef.current && messages.length > 0) {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({ 
          index: messages.length - 1, 
          align: 'end', 
          behavior: 'auto' 
        });
        setAtBottom(true);
        didAutoScrollRef.current = true;
      });
    }
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4">
        {Array.from({ length: 5 }, (_, i) => (
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

  console.log('OptimizedMessageList: About to render', {
    messagesLength: messages.length,
    isLoading,
    isTyping,
    shouldShowEmptyState: messages.length === 0 && !isTyping,
    shouldShowVirtuoso: messages.length > 0 || isTyping
  });

  return (
    <div className="relative h-full overflow-hidden p-4">
      {messages.length === 0 && !isTyping ? (
        <div className="text-center text-muted-foreground py-12">
          <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Welcome to Democratic Deliberation</h3>
          <p>Start a conversation with our AI agents to explore ideas and engage in thoughtful dialogue.</p>
          <div className="text-xs mt-4 p-2 bg-muted rounded">
            Debug: messages.length = {messages.length}, isTyping = {isTyping.toString()}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 p-2 bg-muted rounded text-xs">
            Debug: Rendering Virtuoso with {messages.length} messages
          </div>
          <Virtuoso
            ref={virtuosoRef}
            className="h-full border-2 border-red-500"
            data={messages}
            initialTopMostItemIndex={Math.max(0, messages.length - 1)}
            followOutput="auto"
            atBottomStateChange={setAtBottom}
            itemContent={renderItem}
            increaseViewportBy={200}
            overscan={3}
            components={{
              Footer: () => (
                isTyping ? (
                  <div className="flex gap-3 mt-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-muted-foreground">
                        <Bot className="h-4 w-4 text-white" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="text-sm font-medium mb-1">Deliberating...</div>
                      <Card className="p-3 bg-muted">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </Card>
                    </div>
                  </div>
                ) : <div />
              ),
            }}
          />
        </>
      )}

      {!atBottom && messages.length > 0 && (
        <div className="absolute right-4 bottom-4 z-20">
          <Button
            variant="secondary"
            className="bg-muted text-foreground hover:bg-muted/80"
            onClick={scrollToBottom}
          >
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
});

OptimizedMessageList.displayName = 'OptimizedMessageList';
OptimizedMessageItem.displayName = 'OptimizedMessageItem';