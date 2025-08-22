import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { errorReporter } from '@/utils/errorHandling';
import { logger } from '@/utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorId?: string;
}

export class AdminErrorBoundary extends Component<Props, State> {
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
    logger.error('Admin component error', { error, errorInfo });
    errorReporter.report(error, {
      context: 'AdminPanel',
      errorInfo,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId
    });

    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorId: undefined });
  };

  private handleReloadAdmin = () => {
    // Clear any cached admin data
    localStorage.removeItem('admin-cache');
    window.location.hash = '#/admin';
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-xl">Admin Panel Error</CardTitle>
              <CardDescription>
                An error occurred in the admin panel. This has been reported to the development team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.error && (
                <div className="rounded-md bg-muted p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Error ID: {this.state.errorId}
                  </div>
                  <code className="text-sm text-muted-foreground block">
                    {this.state.error.message}
                  </code>
                </div>
              )}
              <div className="flex gap-2">
                <Button 
                  onClick={this.handleRetry}
                  className="flex-1"
                  variant="default"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button 
                  variant="outline"
                  onClick={this.handleReloadAdmin}
                  className="flex-1"
                >
                  Reload Admin
                </Button>
              </div>
              <Button 
                variant="ghost"
                onClick={() => window.location.hash = '#/'}
                className="w-full"
              >
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}