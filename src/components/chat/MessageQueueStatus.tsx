import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, AlertCircle, RotateCcw, RefreshCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { QueuedMessage } from '@/hooks/useMessageQueue';


interface MessageQueueStatusProps {
  queuedMessages: QueuedMessage[];
  processingCount: number;
  onRetryMessage: (messageId: string) => void;
  onRemoveMessage: (messageId: string) => void;
  onRefreshMessages?: () => void;
}

export const MessageQueueStatus: React.FC<MessageQueueStatusProps> = React.memo(({
  queuedMessages,
  processingCount,
  onRetryMessage,
  onRemoveMessage,
  onRefreshMessages
}) => {

  // Memoize expensive computations with optimized dependencies
  const queueStats = useMemo(() => {
    let queued = 0;
    let failed = 0;
    
    for (const msg of queuedMessages) {
      if (msg.status === 'queued') queued++;
      else if (msg.status === 'failed') failed++;
    }
    
    return {
      queuedCount: queued,
      failedCount: failed,
      totalActive: queued + processingCount
    };
  }, [queuedMessages.length, processingCount, queuedMessages.map(m => m.status).join(',')]);

  const { queuedCount, failedCount, totalActive } = queueStats;

  const getBadgeVariant = useMemo(() => {
    if (failedCount > 0) return 'destructive';
    if (processingCount > 0) return 'default';
    return 'secondary';
  }, [failedCount, processingCount]);

  const getStatusIcon = (status: QueuedMessage['status']) => {
    switch (status) {
      case 'queued':
        return <Clock className="h-3 w-3" />;
      case 'processing':
        return <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-destructive" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Manual refresh button */}
      {onRefreshMessages && (
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 px-2"
          onClick={onRefreshMessages}
          title="Refresh messages"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 px-2 gap-1">
            <Clock className="h-3 w-3" />
            <span className="text-xs">{totalActive}</span>
            {failedCount > 0 && (
              <AlertCircle className="h-3 w-3 text-destructive" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="end">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Message Queue</h3>
              <Badge variant={getBadgeVariant} className="text-xs">
                {queuedCount} queued • {processingCount} processing
              </Badge>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {queuedMessages.length === 0 ? (
                <div className="p-2 text-center text-muted-foreground text-xs">
                  Queue is empty
                </div>
              ) : (
                queuedMessages.map((message, index) => (
                  <div key={message.id} className="flex items-center justify-between p-2 bg-muted/50 rounded border">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getStatusIcon(message.status)}
                      <span className="text-xs text-muted-foreground">#{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate" title={message.content}>
                          {message.content}
                        </p>
                        {message.error && (
                          <p className="text-xs text-destructive truncate mt-1" title={message.error}>
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
                    </div>
                  </div>
                ))
              )}
            </div>

            {failedCount > 0 && (
              <div className="p-2 bg-destructive/10 rounded border border-destructive/20">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-xs text-destructive">
                    {failedCount} message{failedCount > 1 ? 's' : ''} failed to process
                  </span>
                </div>
              </div>
            )}

          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});