import React, { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Zap } from 'lucide-react';
import { logger } from '@/utils/logger';

interface PerformanceErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  performanceIssue: boolean;
}

interface PerformanceErrorBoundaryProps {
  children: ReactNode;
  memoryThreshold?: number; // MB
  timeoutThreshold?: number; // ms
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class PerformanceErrorBoundary extends Component<PerformanceErrorBoundaryProps, PerformanceErrorBoundaryState> {
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  
  constructor(props: PerformanceErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false, 
      performanceIssue: false 
    };
  }

  componentDidMount() {
    this.startPerformanceMonitoring();
  }

  componentWillUnmount() {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }
  }

  static getDerivedStateFromError(error: Error): Partial<PerformanceErrorBoundaryState> {
    // Check if error is performance related
    const isPerformanceIssue = error.message.includes('memory') || 
                              error.message.includes('timeout') ||
                              error.message.includes('Maximum call stack');
    
    return { 
      hasError: true, 
      error,
      performanceIssue: isPerformanceIssue
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('Performance Error Boundary caught an error:', error);
    logger.error('Error info:', errorInfo);
    
    // Log performance metrics if available
    if ('memory' in performance) {
      logger.error('Memory usage:', (performance as any).memory);
    }
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    this.setState({
      hasError: true,
      error,
      errorInfo
    });
  }

  startPerformanceMonitoring = () => {
    const memoryThreshold = this.props.memoryThreshold || 100; // 100MB default
    
    this.memoryCheckInterval = setInterval(() => {
      if ('memory' in performance) {
        const memoryInfo = (performance as any).memory;
        const usedMB = memoryInfo.usedJSHeapSize / (1024 * 1024);
        
        if (usedMB > memoryThreshold) {
          logger.warn('High memory usage detected:', `${usedMB} MB`);
          this.setState({ performanceIssue: true });
        }
      }
    }, 5000); // Check every 5 seconds
  };

  handleOptimizedRetry = () => {
    // Clear caches and optimize before retry
    if ('memory' in performance) {
      // Request garbage collection if available
      if ('gc' in window && typeof (window as any).gc === 'function') {
        (window as any).gc();
      }
    }
    
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined,
      performanceIssue: false
    });
  };

  handleLightModeRetry = () => {
    // Set a flag for light mode operation
    sessionStorage.setItem('performance-light-mode', 'true');
    this.handleOptimizedRetry();
  };

  render() {
    if (this.state.hasError) {
      const isPerformanceIssue = this.state.performanceIssue;

      return (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <Zap className="h-5 w-5" />
              {isPerformanceIssue ? 'Performance Issue Detected' : 'Application Error'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
              <div>
                <p className="font-medium">
                  {isPerformanceIssue 
                    ? 'The application is experiencing performance issues'
                    : 'An error occurred in the application'
                  }
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isPerformanceIssue
                    ? 'High memory usage or slow response times detected. Try optimized recovery.'
                    : 'This error has been logged for investigation.'
                  }
                </p>
              </div>
            </div>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
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
            
            <div className="flex gap-2">
              <Button onClick={this.handleOptimizedRetry} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Optimized Retry
              </Button>
              {isPerformanceIssue && (
                <Button onClick={this.handleLightModeRetry} variant="secondary">
                  <Zap className="w-4 h-4 mr-2" />
                  Light Mode
                </Button>
              )}
              <Button onClick={() => window.location.reload()} variant="default">
                Refresh Page
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}