import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThumbsUp, ThumbsDown, Share, BookOpen } from "lucide-react";
import { getAgentInfo } from "@/utils/agentHelpers";
import type { ChatMessage, AgentType } from "@/types/chat";
import { cn } from "@/lib/utils";

interface ResponseCardProps {
  message: ChatMessage;
  onFeedback?: (messageId: string, type: 'positive' | 'negative') => void;
  onShare?: (messageId: string) => void;
}

export const ResponseCard = ({ message, onFeedback, onShare }: ResponseCardProps) => {
  const isUser = message.message_type === 'user';
  const agentInfo = isUser ? null : getAgentInfo(message.message_type as AgentType);
  
  // Extract confidence and sources from content if available
  const confidenceMatch = message.content.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const relevanceMatch = message.content.match(/RELEVANCE:\s*([0-9.]+)/i);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : null;
  const relevance = relevanceMatch ? parseFloat(relevanceMatch[1]) : null;
  
  // Clean content by removing confidence/relevance scores
  const cleanContent = message.content
    .replace(/CONFIDENCE:\s*[0-9.]+/gi, '')
    .replace(/RELEVANCE:\s*[0-9.]+/gi, '')
    .trim();

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return "bg-green-100 text-green-800 border-green-200";
    if (score >= 0.6) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-red-100 text-red-800 border-red-200";
  };

  if (isUser) {
    return (
      <div className="flex gap-3 flex-row-reverse">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-democratic-blue text-white">
            You
          </AvatarFallback>
        </Avatar>
        
        <Card className="flex-1 max-w-[80%] p-3 bg-democratic-blue text-white">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </div>
          <div className="mt-2 text-xs opacity-80">
            {new Date(message.created_at).toLocaleTimeString()}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className={agentInfo?.color}>
          {agentInfo?.name.charAt(0)}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 max-w-[80%]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">{agentInfo?.name}</span>
          <Badge variant="outline" className="text-xs">
            {agentInfo?.description}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(message.created_at).toLocaleTimeString()}
          </span>
        </div>
        
        <Card className="p-4 bg-muted">
          <div className="whitespace-pre-wrap text-sm leading-relaxed mb-3">
            {cleanContent}
          </div>
          
          {/* Confidence and relevance scores */}
          {(confidence !== null || relevance !== null) && (
            <div className="flex gap-2 mb-3">
              {confidence !== null && (
                <Badge variant="outline" className={cn("text-xs", getConfidenceColor(confidence))}>
                  Confidence: {Math.round(confidence * 100)}%
                </Badge>
              )}
              {relevance !== null && (
                <Badge variant="outline" className={cn("text-xs", getConfidenceColor(relevance))}>
                  Relevance: {Math.round(relevance * 100)}%
                </Badge>
              )}
            </div>
          )}
          
          {/* Proactive engagement indicator */}
          {message.agent_context?.isProactive && (
            <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 text-xs text-blue-700">
                <BookOpen className="h-3 w-3" />
                <span>Proactive facilitation to encourage engagement</span>
              </div>
            </div>
          )}
          
          {/* Action buttons */}
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFeedback?.(message.id, 'positive')}
              className="h-7 px-2"
            >
              <ThumbsUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFeedback?.(message.id, 'negative')}
              className="h-7 px-2"
            >
              <ThumbsDown className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onShare?.(message.id)}
              className="h-7 px-2"
            >
              <Share className="h-3 w-3" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};