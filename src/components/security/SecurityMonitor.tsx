// Security monitoring component for real-time threat detection

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Eye, Lock } from 'lucide-react';

interface SecurityEvent {
  timestamp: string;
  event_type: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  details: any;
}

interface SecurityStats {
  totalEvents: number;
  criticalEvents: number;
  highRiskEvents: number;
  recentEvents: SecurityEvent[];
}

/**
 * Real-time security monitoring dashboard component
 */
export function SecurityMonitor() {
  const [securityStats, setSecurityStats] = useState<SecurityStats>({
    totalEvents: 0,
    criticalEvents: 0,
    highRiskEvents: 0,
    recentEvents: []
  });
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    loadSecurityEvents();
    
    // Set up periodic monitoring
    const interval = setInterval(loadSecurityEvents, 30000); // Every 30 seconds
    setIsMonitoring(true);
    
    return () => {
      clearInterval(interval);
      setIsMonitoring(false);
    };
  }, []);

  const loadSecurityEvents = () => {
    try {
      const events = JSON.parse(localStorage.getItem('security_events') || '[]') as SecurityEvent[];
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      
      // Filter recent events (last hour)
      const recentEvents = events.filter(event => 
        new Date(event.timestamp).getTime() > oneHourAgo
      ).slice(-10); // Last 10 events
      
      const criticalEvents = recentEvents.filter(e => e.risk_level === 'critical').length;
      const highRiskEvents = recentEvents.filter(e => e.risk_level === 'high').length;
      
      setSecurityStats({
        totalEvents: recentEvents.length,
        criticalEvents,
        highRiskEvents,
        recentEvents: recentEvents.reverse() // Most recent first
      });
    } catch (error) {
      console.warn('Failed to load security events:', error);
    }
  };

  const getRiskBadgeVariant = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const formatEventType = (eventType: string) => {
    return eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getSecurityIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'medium': return <Eye className="h-4 w-4 text-yellow-500" />;
      case 'low': return <Shield className="h-4 w-4 text-green-500" />;
      default: return <Lock className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Security Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monitoring Status</CardTitle>
            <Shield className={`h-4 w-4 ${isMonitoring ? 'text-green-500' : 'text-red-500'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isMonitoring ? 'ACTIVE' : 'INACTIVE'}
            </div>
            <p className="text-xs text-muted-foreground">
              Real-time monitoring
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{securityStats.totalEvents}</div>
            <p className="text-xs text-muted-foreground">
              Last hour
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Risk Events</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {securityStats.highRiskEvents}
            </div>
            <p className="text-xs text-muted-foreground">
              Requires attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Events</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {securityStats.criticalEvents}
            </div>
            <p className="text-xs text-muted-foreground">
              Immediate action needed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alerts */}
      {securityStats.criticalEvents > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Critical Security Alert:</strong> {securityStats.criticalEvents} critical security event(s) detected. 
            Immediate attention required.
          </AlertDescription>
        </Alert>
      )}

      {/* Recent Security Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Recent Security Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {securityStats.recentEvents.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No security events in the last hour
            </p>
          ) : (
            <div className="space-y-3">
              {securityStats.recentEvents.map((event, index) => (
                <div key={index} className="flex items-start justify-between p-3 border rounded-lg">
                  <div className="flex items-start gap-3">
                    {getSecurityIcon(event.risk_level)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{formatEventType(event.event_type)}</span>
                        <Badge variant={getRiskBadgeVariant(event.risk_level)}>
                          {event.risk_level.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                      {event.details && Object.keys(event.details).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                            View Details
                          </summary>
                          <pre className="text-xs mt-1 p-2 bg-muted rounded max-w-md overflow-auto">
                            {JSON.stringify(event.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}