import React, { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, ArrowLeft, Route } from 'lucide-react';
import { logger } from '@/utils/logger';

interface RouteErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  routePath?: string;
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
  routePath?: string;
  fallbackRoute?: string;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, routePath: props.routePath };
  }

  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('Route Error Boundary caught an error:', error);
    logger.error('Route path:', this.props.routePath);
    logger.error('Error info:', errorInfo);
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    this.setState({
      hasError: true,
      error,
      errorInfo,
      routePath: this.props.routePath
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = this.props.fallbackRoute || '/';
    }
  };

  handleGoToFallback = () => {
    window.location.href = this.props.fallbackRoute || '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-lg w-full border-warning">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-warning">
                <Route className="h-5 w-5" />
                Page Error
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                <div>
                  <p className="font-medium">This page encountered an error</p>
                  {this.state.routePath && (
                    <p className="text-sm text-muted-foreground">Route: {this.state.routePath}</p>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    The page failed to load properly. You can try refreshing or navigate to a different page.
                  </p>
                </div>
              </div>
              
              {(((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') && this.state.error && (
                <details className="bg-muted p-4 rounded-md">
                  <summary className="cursor-pointer font-medium mb-2">
                    Error Details (Development Only)
                  </summary>
                  <pre className="text-sm overflow-auto">
                    {this.state.error.message}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}
              
              <div className="flex gap-2 flex-wrap">
                <Button onClick={this.handleReset} variant="default">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button onClick={this.handleGoBack} variant="outline">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Go Back
                </Button>
                <Button onClick={this.handleGoToFallback} variant="secondary">
                  Home
                </Button>
                <Button onClick={() => window.location.reload()} variant="ghost">
                  Refresh Page
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