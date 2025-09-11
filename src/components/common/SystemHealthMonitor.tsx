import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { logger } from '@/utils/logger';
import { streamHealthMonitor } from '@/utils/streamHealthMonitor';

interface SystemHealthMonitorProps {
  className?: string;
  onHealthChange?: (isHealthy: boolean) => void;
  onRecoveryAttempt?: () => void;
}

export const SystemHealthMonitor = ({ 
  className, 
  onHealthChange, 
  onRecoveryAttempt 
}: SystemHealthMonitorProps) => {
  const [healthStatus, setHealthStatus] = useState({
    isHealthy: true,
    activeConnections: 0,
    totalConnections: 0,
    status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy'
  });
  
  // Monitor stream health
  useEffect(() => {
    const checkHealth = () => {
      const connections = streamHealthMonitor.getAllConnections();
      const healthyConnections = connections.filter(c => c.isHealthy);
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let isHealthy = true;
      
      if (connections.length > 0) {
        const healthyRatio = healthyConnections.length / connections.length;
        if (healthyRatio < 0.5) {
          status = 'unhealthy';
          isHealthy = false;
        } else if (healthyRatio < 0.8) {
          status = 'degraded';
        }
      }
      
      setHealthStatus({
        isHealthy,
        activeConnections: healthyConnections.length,
        totalConnections: connections.length,
        status
      });
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Notify parent of health changes
  useEffect(() => {
    onHealthChange?.(healthStatus.isHealthy);
  }, [healthStatus.isHealthy, onHealthChange]);

  const getStatusIcon = () => {
    switch (healthStatus.status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'unhealthy':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getStatusColor = () => {
    switch (healthStatus.status) {
      case 'healthy':
        return 'bg-success';
      case 'degraded':
        return 'bg-warning';
      case 'unhealthy':
        return 'bg-destructive';
      default:
        return 'bg-muted';
    }
  };

  const handleRecovery = () => {
    logger.info('System health monitor: Manual recovery initiated');
    onRecoveryAttempt?.();
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1">
        {getStatusIcon()}
        <Badge variant="outline" className={getStatusColor()}>
          {healthStatus.status}
        </Badge>
      </div>
      
      {healthStatus.status !== 'healthy' && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecovery}
          className="text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Recover
        </Button>
      )}
      
      <div className="text-xs text-muted-foreground">
        {healthStatus.totalConnections > 0 ? 
          `${healthStatus.activeConnections}/${healthStatus.totalConnections}` : 
          'Ready'
        }
      </div>
    </div>
  );
};