import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logger } from '@/utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  retryCount: number;
}

export class ErrorRecoveryBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorId: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): State {
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return {
      hasError: true,
      error,
      errorId,
      retryCount: 0
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { errorId } = this.state;
    
    logger.error('ErrorRecoveryBoundary caught error', error, {
      errorId,
      errorInfo: errorInfo.componentStack,
      retryCount: this.state.retryCount
    });

    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    const { retryCount } = this.state;
    
    if (retryCount >= 3) {
      logger.warn('Max retry attempts reached', { 
        errorId: this.state.errorId,
        retryCount 
      });
      return;
    }

    logger.info('Attempting error recovery', {
      errorId: this.state.errorId,
      retryCount: retryCount + 1
    });

    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorId: null,
      retryCount: prevState.retryCount + 1
    }));

    this.props.onRetry?.();
  };

  handleReload = () => {
    logger.info('Manual page reload requested', {
      errorId: this.state.errorId
    });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorId, retryCount } = this.state;
      const canRetry = retryCount < 3;

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-card border rounded-lg">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-4 max-w-md">
            {error?.message || 'An unexpected error occurred. Please try again.'}
          </p>
          
          <div className="flex gap-3">
            {canRetry && (
              <Button 
                onClick={this.handleRetry}
                variant="default"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again ({3 - retryCount} attempts left)
              </Button>
            )}
            
            <Button 
              onClick={this.handleReload}
              variant="outline"
            >
              Reload Page
            </Button>
          </div>
          
          {errorId && (
            <p className="text-xs text-muted-foreground mt-4">
              Error ID: {errorId}
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}