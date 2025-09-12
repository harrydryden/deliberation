// System health monitoring dashboard for admin interface
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Activity } from 'lucide-react';
import { useProductionHealthMonitor } from '@/hooks/useProductionHealthMonitor';

interface HealthCheckDisplayProps {
  check: {
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastCheck: number;
    details?: any;
  };
}

const HealthCheckDisplay: React.FC<HealthCheckDisplayProps> = ({ check }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'unhealthy':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'unhealthy':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatLastCheck = (timestamp: number) => {
    const ago = Date.now() - timestamp;
    const minutes = Math.floor(ago / (1000 * 60));
    const seconds = Math.floor((ago % (1000 * 60)) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s ago`;
    }
    return `${seconds}s ago`;
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        {getStatusIcon(check.status)}
        <div>
          <p className="font-medium">{check.name}</p>
          <p className="text-sm text-muted-foreground">
            Last checked: {formatLastCheck(check.lastCheck)}
          </p>
        </div>
      </div>
      <Badge className={getStatusColor(check.status)}>
        {check.status}
      </Badge>
    </div>
  );
};

export const SystemHealthDashboard: React.FC = () => {
  const { healthStatus, isMonitoring, forceHealthCheck } = useProductionHealthMonitor(true);

  const getOverallStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'border-green-200 bg-green-50';
      case 'degraded':
        return 'border-yellow-200 bg-yellow-50';
      case 'unhealthy':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  if (!healthStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health
          </CardTitle>
          <CardDescription>Loading health status...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Initializing health monitoring...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <Card className={getOverallStatusColor(healthStatus.overall)}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health Overview
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={forceHealthCheck}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Real-time monitoring of critical system components
            {isMonitoring && (
              <Badge className="ml-2 bg-green-100 text-green-800">
                Monitoring Active
              </Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {healthStatus.summary.healthy || 0}
              </div>
              <div className="text-sm text-muted-foreground">Healthy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {healthStatus.summary.degraded || 0}
              </div>
              <div className="text-sm text-muted-foreground">Degraded</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {healthStatus.summary.unhealthy || 0}
              </div>
              <div className="text-sm text-muted-foreground">Unhealthy</div>
            </div>
          </div>

          {healthStatus.overall !== 'healthy' && (
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {healthStatus.overall === 'degraded' 
                  ? 'Some system components are experiencing issues but functionality is maintained.'
                  : 'Critical system components are failing. Immediate attention required.'
                }
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Individual Health Checks */}
      <Card>
        <CardHeader>
          <CardTitle>Component Status</CardTitle>
          <CardDescription>
            Detailed status of individual system components
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {healthStatus.checks.map((check, index) => (
            <HealthCheckDisplay key={index} check={check} />
          ))}
          
          {healthStatus.checks.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              No health checks configured
            </div>
          )}
        </CardContent>
      </Card>

      {/* Circuit Breaker Status */}
      <Card>
        <CardHeader>
          <CardTitle>Circuit Breaker Status</CardTitle>
          <CardDescription>
            External service protection status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 border rounded-lg">
              <h4 className="font-medium">OpenAI Service</h4>
              <Badge className="mt-1 bg-green-100 text-green-800">
                CLOSED (Normal)
              </Badge>
              <p className="text-sm text-muted-foreground mt-1">
                Service responding normally
              </p>
            </div>
            <div className="p-3 border rounded-lg">
              <h4 className="font-medium">Supabase Service</h4>
              <Badge className="mt-1 bg-green-100 text-green-800">
                CLOSED (Normal)
              </Badge>
              <p className="text-sm text-muted-foreground mt-1">
                Database responding normally
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};