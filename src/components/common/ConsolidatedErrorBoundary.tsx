// Consolidated production-ready error boundary
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, RefreshCw, Home, Zap } from 'lucide-react';
import { logger } from '@/utils/logger';
import { enhancedErrorReporter } from '@/utils/enhancedErrorReporting';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  context?: string;
  showDetails?: boolean;
  retryable?: boolean;
  memoryThreshold?: number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
  retryCount: number;
  isPerformanceIssue: boolean;
}

export class ConsolidatedErrorBoundary extends Component<Props, State> {
  private retryTimeouts: NodeJS.Timeout[] = [];
  private memoryCheckInterval: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      retryCount: 0,
      isPerformanceIssue: false
    };
  }

  componentDidMount() {
    // Production-optimized: No memory monitoring in production
    if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') {
      this.startLightweightMonitoring();
    }
  }

  componentWillUnmount() {
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const isPerformanceIssue = error.message.includes('memory') || 
                             error.message.includes('timeout') ||
                             error.message.includes('Maximum call stack');
    
    return {
      hasError: true,
      error,
      errorId,
      isPerformanceIssue
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Enhanced error reporting with structured context
    enhancedErrorReporter.reportError(error, {
      component: this.props.context || 'ConsolidatedErrorBoundary',
      operation: 'error-boundary',
      metadata: { errorInfo, props: this.props }
    });
    
    // Log performance metrics in development
    if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development' && 'memory' in performance) {
      logger.debug('Memory usage at error', (performance as any).memory);
    }
    
    this.props.onError?.(error, errorInfo);
    this.setState({ errorInfo });
  }

  startLightweightMonitoring = () => {
    // Production-safe: Completely disabled in production
    if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'production') return;
    
    const memoryThreshold = this.props.memoryThreshold || 200; // Increased threshold to reduce noise
    
    this.memoryCheckInterval = setInterval(() => {
      if ('memory' in performance) {
        const memoryInfo = (performance as any).memory;
        const usedMB = memoryInfo.usedJSHeapSize / (1024 * 1024);
        
        // Only warn if memory is significantly high and report as structured error
        if (usedMB > memoryThreshold) {
          enhancedErrorReporter.reportMemoryIssue(usedMB, memoryThreshold, {
            component: 'ConsolidatedErrorBoundary',
            operation: 'memory-monitoring'
          });
          this.setState({ isPerformanceIssue: true });
        }
      }
    }, 300000); // Reduced frequency: Check every 5 minutes instead of every minute
  };

  handleRetry = () => {
    const { retryCount } = this.state;
    const maxRetries = 3;

    if (retryCount >= maxRetries) {
      logger.warn('Max retry attempts reached', { errorId: this.state.errorId });
      return;
    }

    // Clear caches if performance issue
    if (this.state.isPerformanceIssue && 'gc' in window && typeof (window as any).gc === 'function') {
      (window as any).gc();
    }

    logger.info('Retrying after error', { 
      errorId: this.state.errorId, 
      attempt: retryCount + 1 
    });

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      retryCount: retryCount + 1,
      isPerformanceIssue: false
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorId, retryCount, isPerformanceIssue } = this.state;
      const { showDetails = false, retryable = true } = this.props;
      const maxRetries = 3;

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                {isPerformanceIssue ? (
                  <Zap className="h-6 w-6 text-warning" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-destructive" />
                )}
              </div>
              <CardTitle className="text-xl">
                {isPerformanceIssue ? 'Performance Issue' : 'Something went wrong'}
              </CardTitle>
              <p className="text-muted-foreground">
                {isPerformanceIssue 
                  ? 'The application is experiencing performance issues.'
                  : 'We encountered an unexpected error. Our team has been notified.'
                }
              </p>
              {errorId && (
                <p className="text-xs text-muted-foreground font-mono mt-2">
                  Error ID: {errorId}
                </p>
              )}
            </CardHeader>
            
            <CardContent className="space-y-4">
              {showDetails && error && (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') && (
                <div className="rounded-md bg-muted p-4">
                  <h4 className="font-semibold mb-2">Error Details (Development Only)</h4>
                  <p className="text-sm text-muted-foreground">
                    {error.message}
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {retryable && retryCount < maxRetries && (
                  <Button 
                    onClick={this.handleRetry}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {isPerformanceIssue ? 'Optimized Retry' : 'Retry'} 
                    {retryCount > 0 && ` (${retryCount}/${maxRetries})`}
                  </Button>
                )}
                
                <Button 
                  onClick={() => window.location.href = '/'}
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
                    Multiple retry attempts failed. Please refresh the page.
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