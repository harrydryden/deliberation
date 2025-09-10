import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { RefreshCw, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useMessageQueue } from '@/hooks/useMessageQueue';
import { logger } from '@/utils/logger';

interface MessageQueueDebugPanelProps {
  messageQueue: ReturnType<typeof useMessageQueue>;
  recovery?: {
    getStats: () => any;
    performHealthCheck: () => void;
    recoverStuck: () => void;
  };
}

export const MessageQueueDebugPanel: React.FC<MessageQueueDebugPanelProps> = ({
  messageQueue,
  recovery
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const stats = messageQueue.getQueueStats;
  const recoveryStats = recovery?.getStats();

  const handleRefresh = () => {
    setLastUpdate(new Date());
    recovery?.performHealthCheck();
    logger.info('Manual queue refresh triggered');
  };

  const handleRecovery = () => {
    recovery?.recoverStuck();
    logger.info('Manual recovery triggered');
  };

  const handleClearFailed = () => {
    messageQueue.clearFailedMessages();
    logger.info('Failed messages cleared manually');
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear the entire queue? This cannot be undone.')) {
      messageQueue.clearQueue();
      logger.info('Queue cleared manually');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-xs opacity-70 hover:opacity-100"
          title="Queue Debug Panel"
        >
          Debug
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Message Queue Debug Panel</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
              {recovery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecovery}
                  className="gap-1"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Recover
                </Button>
              )}
            </div>
          </div>

          {/* Queue Statistics */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Queue Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">{stats.total}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-yellow-600">{stats.queued}</div>
                  <div className="text-xs text-muted-foreground">Queued</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-600">{stats.processing}</div>
                  <div className="text-xs text-muted-foreground">Processing</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600">{stats.failed}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">Can Process:</span>
                <Badge variant={stats.canProcess ? "default" : "destructive"}>
                  {stats.canProcess ? "Yes" : "No"}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Queue Empty:</span>
                <Badge variant={stats.isEmpty ? "secondary" : "default"}>
                  {stats.isEmpty ? "Yes" : "No"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Recovery Statistics */}
          {recoveryStats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recovery System</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">System Health:</span>
                  <Badge variant={recoveryStats.isHealthy ? "default" : "destructive"}>
                    {recoveryStats.isHealthy ? "Healthy" : "Issues Detected"}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Health Check:</span>
                  <span className="text-xs">
                    {new Date(recoveryStats.lastHealthCheck).toLocaleTimeString()}
                  </span>
                </div>
                
                {recoveryStats.recoveryAttempts.length > 0 && (
                  <div className="mt-2">
                    <div className="text-sm font-medium mb-1">Recovery Attempts:</div>
                    <div className="space-y-1 max-h-20 overflow-y-auto">
                      {recoveryStats.recoveryAttempts.map((attempt: any, index: number) => (
                        <div key={index} className="text-xs bg-muted p-1 rounded">
                          Message {attempt.messageId}: {attempt.attempts} attempts
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Queue Messages */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Queue Contents</CardTitle>
            </CardHeader>
            <CardContent>
              {messageQueue.queue.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-4">
                  Queue is empty
                </div>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {messageQueue.queue.map((message, index) => (
                    <div key={message.id} className="p-2 bg-muted rounded text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">#{index + 1}</span>
                        <div className="flex items-center gap-1">
                          <Badge 
                            variant={
                              message.status === 'completed' ? 'default' :
                              message.status === 'failed' ? 'destructive' :
                              message.status === 'processing' ? 'secondary' : 'outline'
                            }
                            className="text-xs"
                          >
                            {message.status}
                          </Badge>
                          {message.retries > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {message.retries} retries
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="truncate mb-1" title={message.content}>
                        {message.content}
                      </div>
                      <div className="text-muted-foreground">
                        Created: {new Date(message.timestamp).toLocaleTimeString()}
                      </div>
                      {message.error && (
                        <div className="text-red-600 mt-1" title={message.error}>
                          Error: {message.error.substring(0, 50)}...
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearFailed}
                  disabled={stats.failed === 0}
                  className="gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear Failed ({stats.failed})
                </Button>
                
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearAll}
                  disabled={stats.total === 0}
                  className="gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear All
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Debug Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Debug Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Last Updated: {lastUpdate.toLocaleTimeString()}</div>
                <div>Processing Set Size: {messageQueue.processing.size}</div>
                <div>Queue Array Length: {messageQueue.queue.length}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};