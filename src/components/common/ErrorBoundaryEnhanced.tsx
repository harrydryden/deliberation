// Enhanced error boundary with performance monitoring and recovery
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { logger } from '@/utils/logger';
import { APIError, ErrorContext } from '@/types/performance';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  context?: ErrorContext;
  showDetails?: boolean;
  retryable?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
  retryCount: number;
}

export class ErrorBoundaryEnhanced extends Component<Props, State> {
  private retryTimeouts: NodeJS.Timeout[] = [];
  private performanceStart: number = 0;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      retryCount: 0
    };
    this.performanceStart = Date.now();
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate unique error ID for tracking
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorContext: ErrorContext = {
      ...this.props.context,
      component: errorInfo.componentStack?.split('\n')[1]?.trim() || 'Unknown',
      metadata: {
        errorBoundary: true,
        retryCount: this.state.retryCount,
        renderTime: Date.now() - this.performanceStart
      }
    };

    // Log detailed error information
    logger.error('Error Boundary caught error', error, {
      errorInfo: errorInfo.componentStack,
      context: errorContext,
      errorId: this.state.errorId
    });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    this.setState({
      errorInfo
    });

    // Track error in performance metrics
    if (window.performance && window.performance.mark) {
      window.performance.mark(`error-boundary-${this.state.errorId}`);
    }
  }

  componentWillUnmount() {
    // Clean up any pending retry timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
  }

  handleRetry = () => {
    const { retryCount } = this.state;
    const maxRetries = 3;
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff, max 10s

    if (retryCount >= maxRetries) {
      logger.warn('Max retry attempts reached', { 
        errorId: this.state.errorId, 
        retryCount 
      });
      return;
    }

    logger.info('Retrying error boundary recovery', { 
      errorId: this.state.errorId, 
      attempt: retryCount + 1,
      delay: retryDelay 
    });

    // Show loading state briefly
    this.setState({ 
      retryCount: retryCount + 1,
      hasError: false 
    });

    // Delay retry to prevent immediate re-error
    const timeout = setTimeout(() => {
      // Reset error state
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: ''
      });
    }, retryDelay);

    this.retryTimeouts.push(timeout);
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, errorId, retryCount } = this.state;
      const { showDetails = false, retryable = true } = this.props;
      const maxRetries = 3;

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl">Something went wrong</CardTitle>
              <p className="text-muted-foreground">
                We encountered an unexpected error. Our team has been notified.
              </p>
              {errorId && (
                <p className="text-xs text-muted-foreground font-mono mt-2">
                  Error ID: {errorId}
                </p>
              )}
            </CardHeader>
            
            <CardContent className="space-y-4">
              {showDetails && error && (
                <div className="rounded-md bg-muted p-4">
                  <h4 className="font-semibold mb-2">Error Details</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    {error.message}
                  </p>
                  {errorInfo && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium">
                        Component Stack (Click to expand)
                      </summary>
                      <pre className="mt-2 text-xs text-muted-foreground overflow-auto whitespace-pre-wrap">
                        {errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {retryable && retryCount < maxRetries && (
                  <Button 
                    onClick={this.handleRetry}
                    className="flex items-center gap-2"
                    disabled={retryCount >= maxRetries}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry {retryCount > 0 && `(${retryCount}/${maxRetries})`}
                  </Button>
                )}
                
                <Button 
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Home className="h-4 w-4" />
                  Go Home
                </Button>
              </div>

              {retryCount >= maxRetries && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Multiple retry attempts failed. Please refresh the page or contact support.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}