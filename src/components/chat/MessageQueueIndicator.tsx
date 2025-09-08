import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, AlertCircle, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import type { QueuedMessage } from '@/hooks/useMessageQueue';

interface MessageQueueIndicatorProps {
  queuedMessages: QueuedMessage[];
  processingCount: number;
  onRetryMessage: (messageId: string) => void;
  onRemoveMessage: (messageId: string) => void;
}

export const MessageQueueIndicator: React.FC<MessageQueueIndicatorProps> = ({
  queuedMessages,
  processingCount,
  onRetryMessage,
  onRemoveMessage
}) => {
  if (queuedMessages.length === 0) {
    return null;
  }

  const getStatusIcon = (status: QueuedMessage['status']) => {
    switch (status) {
      case 'queued':
        return <Clock className="h-3 w-3" />;
      case 'processing':
        return <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'failed':
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const getStatusVariant = (status: QueuedMessage['status']) => {
    switch (status) {
      case 'queued':
        return 'secondary' as const;
      case 'processing':
        return 'default' as const;
      case 'completed':
        return 'outline' as const;
      case 'failed':
        return 'destructive' as const;
      default:
        return 'secondary' as const;
    }
  };

  const queuedCount = queuedMessages.filter(msg => msg.status === 'queued').length;
  const failedCount = queuedMessages.filter(msg => msg.status === 'failed').length;

  return (
    <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium">Message Queue</span>
          <Badge variant="outline" className="text-xs">
            {queuedCount} queued • {processingCount} processing
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        {queuedMessages.map((message, index) => (
          <div key={message.id} className="flex items-center justify-between p-2 bg-background rounded border">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Badge variant={getStatusVariant(message.status)} className="flex items-center gap-1 shrink-0">
                {getStatusIcon(message.status)}
                <span className="capitalize">{message.status}</span>
              </Badge>
              
              <span className="text-xs text-muted-foreground">#{index + 1}</span>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" title={message.content}>
                  {message.content}
                </p>
                {message.error && (
                  <p className="text-xs text-red-500 truncate mt-1" title={message.error}>
                    Error: {message.error}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {message.status === 'failed' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRetryMessage(message.id)}
                  className="h-6 w-6 p-0"
                  title="Retry message"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
              
              {(message.status === 'completed' || message.status === 'failed') && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveMessage(message.id)}
                  className="h-6 w-6 p-0"
                  title="Remove from queue"
                >
                  <XCircle className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {failedCount > 0 && (
        <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm text-red-700 dark:text-red-400">
              {failedCount} message{failedCount > 1 ? 's' : ''} failed to process
            </span>
          </div>
        </div>
      )}
    </div>
  );
};