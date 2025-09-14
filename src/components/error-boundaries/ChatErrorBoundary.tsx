import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquareX, RefreshCw } from 'lucide-react';
import { errorReporter } from '@/utils/errorHandling';
import { logger } from '@/utils/logger';

interface Props {
  children: ReactNode;
  deliberationId?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRecover?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorId?: string;
}

export class ChatErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true, 
      error,
      errorId: Math.random().toString(36).substring(7)
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Chat component error', { 
      error, 
      errorInfo, 
      deliberationId: this.props.deliberationId 
    });
    
    errorReporter.report(error, {
      context: 'ChatInterface',
      errorInfo,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      deliberationId: this.props.deliberationId
    });

    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorId: undefined });
    this.props.onRecover?.();
  };

  private handleResetChat = () => {
    // Clear chat-specific cache
    const deliberationId = this.props.deliberationId;
    if (deliberationId) {
      localStorage.removeItem(`chat-messages-${deliberationId}`);
      localStorage.removeItem(`chat-state-${deliberationId}`);
    }
    this.handleRetry();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[400px] p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <MessageSquareX className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-lg">Chat Error</CardTitle>
              <CardDescription>
                Something went wrong with the chat interface. Don't worry, your data is safe.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.error && (
                <div className="rounded-md bg-muted p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Error ID: {this.state.errorId}
                  </div>
                  <code className="text-xs text-muted-foreground block">
                    {this.state.error.message}
                  </code>
                </div>
              )}
              <div className="flex gap-2">
                <Button 
                  onClick={this.handleRetry}
                  size="sm"
                  className="flex-1"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
                <Button 
                  variant="outline"
                  onClick={this.handleResetChat}
                  size="sm"
                  className="flex-1"
                >
                  Reset Chat
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}