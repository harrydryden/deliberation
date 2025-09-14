import React, { useEffect, useRef, useState, useCallback, lazy, Suspense, memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bot, User, Users, Workflow, FileText, Loader2, Share2, RefreshCw, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatMessageTime } from '@/utils/timeDisplay';
const LazyMarkdownMessage = lazy(() => import("@/components/common/MarkdownMessage").then(m => ({ default: m.MarkdownMessage })));
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import type { ChatMessage } from "@/types/index";
import { AgentConfig } from "@/types/common";
import SimilarIbisNodes from "@/components/chat/SimilarIbisNodes";
import { MessageRating } from "@/components/chat/MessageRating";
import { useSimplifiedPerformance } from '@/hooks/useOptimizedState';
import { useOptimizedMessageLoading } from "@/hooks/useOptimizedMessageLoading";
import { useProgressiveFallback } from "@/hooks/useProgressiveFallback";
import { performanceMonitor } from "@/utils/performanceMonitor";
import { logger } from "@/utils/logger";

interface MessageListProps {
  messages?: ChatMessage[]; // Made optional since we'll load internally
  isLoading?: boolean; // Made optional
  isTyping: boolean;
  onAddToIbis?: (messageId: string, content: string) => void;
  onRetry?: (id: string, content: string) => void;
  onRetryStream?: (messageId: string) => void; // New retry stream functionality
  deliberationId: string; // Required for optimized loading
  agentConfigs?: AgentConfig[];
  streamingState?: {
    isStreaming: boolean;
    messageId: string | null;
    retryCount: number;
    lastError: string | null;
    canRetry: boolean;
  };
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
  }
} as const;

// Optimized message item with proper memoization
const OptimizedMessageItem = memo(({ 
  message, 
  index, 
  unreadIndex, 
  onAddToIbis, 
  onRetry,
  onRetryStream,
  agentConfigsMap, 
  deliberationId,
  streamingState
}: { 
  message: ChatMessage;
  index: number;
  unreadIndex: number | null;
  onAddToIbis?: (messageId: string, content: string) => void;
  onRetry?: (id: string, content: string) => void;
  onRetryStream?: (messageId: string) => void;
  agentConfigsMap: Map<string, AgentConfig>;
  deliberationId?: string;
  streamingState?: {
    isStreaming: boolean;
    messageId: string | null;
    retryCount: number;
    lastError: string | null;
    canRetry: boolean;
  };
}) => {
  const isUser = message.message_type === 'user';
  
  // Optimized agent config lookup with proper typing
  const agentConfig = useMemo(() => 
    agentConfigsMap.get(message.message_type), 
    [agentConfigsMap, message.message_type]
  );
  
  const fallbackAgentInfo = useMemo(() => {
    const agentKey = message.message_type as keyof typeof AGENTS;
    return AGENTS[agentKey] || null;
  }, [message.message_type]);
  
  const agentInfo = useMemo(() => {
    if (isUser) return null;
    
    // Handle known agent types
    if (fallbackAgentInfo) {
      return {
        ...fallbackAgentInfo,
        name: agentConfig?.name || fallbackAgentInfo.name,
        description: agentConfig?.description || fallbackAgentInfo.description
      };
    }
    
    // Handle unknown agent types with generic fallback
    logger.warn(`Using generic fallback for unknown agent type: ${message.message_type}`, { messageType: message.message_type, messageId: message.id });
    return {
      name: 'Agent',
      icon: Bot,
      color: 'bg-muted-foreground',
      bgColor: 'bg-muted',
      description: 'AI Assistant'
    };
  }, [isUser, agentConfig, fallbackAgentInfo, message.message_type, message.id]);
  const AgentIcon = agentInfo?.icon || Bot;

  const handleAddToIbis = useCallback(() => {
    onAddToIbis?.(message.id, message.content);
  }, [onAddToIbis, message.id, message.content]);

  const handleRetry = useCallback(() => {
    onRetry?.(message.id, message.content);
  }, [onRetry, message.id, message.content]);

  const handleRetryStream = useCallback(() => {
    onRetryStream?.(message.id);
  }, [onRetryStream, message.id]);

  const handleShare = useCallback(() => {
    // For user messages, "Share" means submit to IBIS
    if (isUser) {
      onAddToIbis?.(message.id, message.content);
    }
  }, [isUser, onAddToIbis, message.id, message.content]);

  // Check if this message is currently streaming or has stream issues
  const isCurrentlyStreaming = streamingState?.isStreaming && streamingState?.messageId === message.id;
  const hasStreamError = !isUser && streamingState?.lastError && streamingState?.messageId === message.id;
  const canRetryStream = !isUser && streamingState?.canRetry && streamingState?.messageId === message.id;

  return (
    <div className="pb-4 min-h-[80px]">
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex gap-3 max-w-[80%] ${isUser ? 'flex-row-reverse' : ''}`}>
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className={isUser ? 'bg-user-message' : agentInfo?.color || 'bg-muted-foreground'}>
              {isUser ? (
                <User className="h-4 w-4 text-white" />
              ) : (
                <AgentIcon className="h-4 w-4 text-white" />
              )}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className={`flex items-center gap-2 mb-1 ${isUser ? 'justify-end' : ''}`}>
              <span className="text-sm font-medium">
                {isUser ? 'You' : (agentInfo?.name || 'Agent')}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatMessageTime(message.created_at)}
              </span>
            </div>
            
            <Card className="p-3 relative bg-card border">
              {/* Stream status indicator for agent messages */}
              {!isUser && (isCurrentlyStreaming || hasStreamError) && (
                <div className="absolute top-2 right-2 z-10">
                  {isCurrentlyStreaming && (
                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Streaming... (Attempt {(streamingState?.retryCount || 0) + 1})
                    </Badge>
                  )}
                  {hasStreamError && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Stream Error
                    </Badge>
                  )}
                </div>
              )}
              
              <div className={`${isUser ? 'pr-20 pb-8' : hasStreamError ? 'pb-8' : ''}`}>
                <Suspense fallback={<Skeleton className="h-4 w-full" />}>
                  <LazyMarkdownMessage 
                    content={message.content}
                    className={isUser ? 'max-w-none overflow-hidden' : ''}
                  />
                </Suspense>
              </div>
              
              {/* Stream error display and retry button */}
              {hasStreamError && (
                <div className="mt-3 pt-2 border-t border-destructive/20 bg-destructive/5 rounded p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-destructive font-medium">Stream interrupted</p>
                      <p className="text-xs text-muted-foreground">{streamingState?.lastError}</p>
                    </div>
                    {canRetryStream && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRetryStream}
                        className="text-xs h-7 ml-2"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry Stream
                      </Button>
                    )}
                  </div>
                </div>
              )}
              
              {/* Share button or Shared badge for user messages */}
              {isUser && (
                <div className="absolute bottom-2 right-2 z-10">
                  {message.submitted_to_ibis ? (
                    <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                      Shared
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleShare}
                      className="text-xs h-6 bg-background border shadow-sm whitespace-nowrap"
                      title="Share to IBIS - add descriptions and links"
                    >
                      <Share2 className="h-3 w-3 mr-1" />
                      Share
                    </Button>
                  )}
                </div>
              )}

              {/* Rating buttons for agent messages (only show if no stream error) */}
              {!isUser && !hasStreamError && (
                <div className="mt-3 pt-2 border-t border-muted/50">
                  <MessageRating 
                    messageId={message.id}
                    messageType={message.message_type}
                    className="text-xs"
                  />
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  // PERFORMANCE: Optimized shallow comparison
  return (
    prev.message.id === next.message.id && 
    prev.message.content === next.message.content &&
    prev.message.status === next.message.status &&
    prev.unreadIndex === next.unreadIndex &&
    prev.index === next.index &&
    prev.streamingState?.isStreaming === next.streamingState?.isStreaming &&
    prev.streamingState?.messageId === next.streamingState?.messageId
  );
}
);

export const OptimizedMessageList = memo(({ 
  messages, 
  isLoading, 
  isTyping, 
  onAddToIbis, 
  onRetry,
  onRetryStream,
  deliberationId, 
  agentConfigs,
  streamingState
}: MessageListProps) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  
  // UI state management
  const [atBottom, setAtBottom] = useState(true);
  const [unreadIndex, setUnreadIndex] = useState<number | null>(null);
  const prevCountRef = useRef(0);
  const didAutoScrollRef = useRef(false);

  // PERFORMANCE: Stable agent config map with proper memoization
  const agentConfigsMap = useMemo(() => {
    if (!agentConfigs?.length) return new Map<string, AgentConfig>();
    
    const map = new Map<string, AgentConfig>();
    agentConfigs.forEach(config => {
      map.set(config.agent_type, config);
    });
    return map;
  }, [agentConfigs]); // Fixed: proper dependency tracking

  // Memoized render function for each message item - stable dependencies
  const renderItem = useCallback((index: number, message: ChatMessage) => {
      return (
        <OptimizedMessageItem
          message={message}
          index={index}
          unreadIndex={unreadIndex}
          onAddToIbis={onAddToIbis}
          onRetry={onRetry}
          onRetryStream={onRetryStream}
          agentConfigsMap={agentConfigsMap}
          deliberationId={deliberationId}
          streamingState={streamingState}
        />
      );
    }, [unreadIndex, onAddToIbis, onRetry, onRetryStream, deliberationId, streamingState]);

  // Auto-scroll optimization with proper cleanup
  const scrollToBottom = useCallback(() => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ 
        index: messages.length - 1, 
        align: 'end', 
        behavior: 'smooth' 
      });
      setUnreadIndex(null);
    }
  }, [messages.length]);

  // Batch state updates to prevent excessive re-renders
  useEffect(() => {
    const hasNewMessages = messages.length > prevCountRef.current;
    if (!atBottom && hasNewMessages) {
      setUnreadIndex(prevCountRef.current);
    }
    prevCountRef.current = messages.length;
  }, [messages.length, atBottom]);

  // Initial scroll with proper RAF cleanup
  useEffect(() => {
    if (!didAutoScrollRef.current && messages.length > 0) {
      const rafId = requestAnimationFrame(() => {
        if (virtuosoRef.current) {
          virtuosoRef.current.scrollToIndex({ 
            index: messages.length - 1, 
            align: 'end', 
            behavior: 'auto' 
          });
          setAtBottom(true);
          didAutoScrollRef.current = true;
        }
      });
      
      // Cleanup RAF on unmount or dependency change
      return () => {
        cancelAnimationFrame(rafId);
      };
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

  return (
    <div className="relative h-full overflow-hidden p-4">
      {messages.length === 0 && !isTyping ? (
        <div className="text-center text-muted-foreground py-12">
          <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Welcome to Deliberation</h3>
          <p>Join the conversation...</p>
        </div>
      ) : (
        <>
          <Virtuoso
            ref={virtuosoRef}
            style={{ height: '100%' }}
            data={messages}
            initialTopMostItemIndex={Math.max(0, messages.length - 1)}
            followOutput="auto"
            atBottomStateChange={setAtBottom}
            itemContent={renderItem}
            increaseViewportBy={200}
            overscan={5}
            defaultItemHeight={120}
            components={{
              Footer: () => (
                isTyping ? (
                  <div className="flex gap-3 mt-2 min-h-[60px]">
                    <Avatar className="h-8 w-8 flex-shrink-0">
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
                ) : <div style={{ minHeight: '1px' }} />
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