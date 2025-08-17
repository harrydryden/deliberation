// Security monitoring dashboard for admin users
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, AlertTriangle, Eye, Activity, FileText, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { securityMonitor, SecurityAlert } from '@/services/securityMonitor.service';
import { useToast } from '@/hooks/use-toast';

interface SecurityMetrics {
  recentEvents: number;
  criticalEvents: number;
  suspiciousActivity: number;
  blockedAttempts: number;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  user_id?: string;
  ip_address?: string;
  risk_level: string;
  details: Record<string, any>;
  created_at: string;
  resolved: boolean;
}

export function SecurityDashboard() {
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState('24h');
  const { toast } = useToast();

  useEffect(() => {
    loadSecurityData();
    
    // Subscribe to real-time security alerts
    const unsubscribe = securityMonitor.onSecurityAlert((alert) => {
      setAlerts(prev => [alert, ...prev.slice(0, 9)]); // Keep only 10 most recent
      
      // Show toast for critical alerts
      if (alert.severity === 'critical') {
        toast({
          title: "Critical Security Alert",
          description: alert.message,
          variant: "destructive",
        });
      }
    });

    // Refresh data every 30 seconds
    const interval = setInterval(loadSecurityData, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [selectedTimeframe, toast]);

  const loadSecurityData = async () => {
    try {
      // Get metrics from security monitor
      const metricsData = await securityMonitor.getSecurityMetrics();
      setMetrics(metricsData);

      // Get recent security events from database
      const timeframe = getTimeframeHours(selectedTimeframe);
      const cutoff = new Date(Date.now() - timeframe * 60 * 60 * 1000);
      
      const { data: eventsData, error } = await supabase
        .from('security_events')
        .select('*')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEvents(eventsData || []);

    } catch (error) {
      console.error('Failed to load security data:', error);
      toast({
        title: "Error",
        description: "Failed to load security data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getTimeframeHours = (timeframe: string): number => {
    switch (timeframe) {
      case '1h': return 1;
      case '24h': return 24;
      case '7d': return 168;
      case '30d': return 720;
      default: return 24;
    }
  };

  const getRiskBadgeVariant = (riskLevel: string) => {
    switch (riskLevel.toLowerCase()) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'medium': return <Eye className="h-4 w-4 text-yellow-500" />;
      default: return <Activity className="h-4 w-4 text-blue-500" />;
    }
  };

  const formatEventType = (eventType: string): string => {
    return eventType.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const resolveAlert = async (alertId: string) => {
    try {
      setAlerts(prev => prev.map(alert => 
        alert.id === alertId ? { ...alert, resolved: true } : alert
      ));
      
      toast({
        title: "Alert Resolved",
        description: "Security alert has been marked as resolved",
      });
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Security Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Recent Events</p>
                <p className="text-2xl font-bold">{metrics?.recentEvents || 0}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical Events</p>
                <p className="text-2xl font-bold text-destructive">{metrics?.criticalEvents || 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Suspicious Activity</p>
                <p className="text-2xl font-bold text-orange-500">{metrics?.suspiciousActivity || 0}</p>
              </div>
              <Eye className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Blocked Attempts</p>
                <p className="text-2xl font-bold text-green-600">{metrics?.blockedAttempts || 0}</p>
              </div>
              <Shield className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts */}
      {alerts.filter(a => !a.resolved).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Active Security Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.filter(a => !a.resolved).slice(0, 5).map(alert => (
              <Alert key={alert.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    {getSeverityIcon(alert.severity)}
                    <div>
                      <AlertDescription className="font-medium">
                        {alert.message}
                      </AlertDescription>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(alert.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolveAlert(alert.id)}
                  >
                    Resolve
                  </Button>
                </div>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Security Events */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Security Events
            </CardTitle>
            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              className="px-3 py-1 rounded border bg-background"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="events" className="w-full">
            <TabsList>
              <TabsTrigger value="events">Recent Events</TabsTrigger>
              <TabsTrigger value="critical">Critical Only</TabsTrigger>
              <TabsTrigger value="users">User Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="events" className="space-y-3">
              {events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No security events in the selected timeframe</p>
                </div>
              ) : (
                events.map(event => (
                  <div key={event.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={getRiskBadgeVariant(event.risk_level)}>
                          {event.risk_level}
                        </Badge>
                        <span className="font-medium">{formatEventType(event.event_type)}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      {event.ip_address && <span>IP: {event.ip_address} • </span>}
                      {event.user_id && <span>User ID: {event.user_id.slice(0, 8)}... • </span>}
                      {Object.keys(event.details).length > 0 && (
                        <span>Details: {JSON.stringify(event.details)}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="critical" className="space-y-3">
              {events.filter(e => e.risk_level === 'critical').map(event => (
                <div key={event.id} className="border border-destructive rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="font-medium text-destructive">{formatEventType(event.event_type)}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="text-sm">
                    {event.details && Object.entries(event.details).map(([key, value]) => (
                      <div key={key}>
                        <strong>{key}:</strong> {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="users" className="space-y-3">
              {events.filter(e => e.user_id).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No user-related security events in the selected timeframe</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* User activity summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">Unique Users</p>
                          <p className="text-xl font-bold">
                            {new Set(events.filter(e => e.user_id).map(e => e.user_id)).size}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">Auth Events</p>
                          <p className="text-xl font-bold">
                            {events.filter(e => e.event_type.includes('auth')).length}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">Failed Attempts</p>
                          <p className="text-xl font-bold text-destructive">
                            {events.filter(e => e.event_type.includes('failed') || e.event_type.includes('blocked')).length}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Recent user events */}
                  <div className="space-y-3">
                    {events.filter(e => e.user_id).slice(0, 10).map(event => (
                      <div key={event.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={getRiskBadgeVariant(event.risk_level)}>
                              {event.risk_level}
                            </Badge>
                            <span className="font-medium">{formatEventType(event.event_type)}</span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(event.created_at).toLocaleString()}
                          </span>
                        </div>
                        
                        <div className="text-sm text-muted-foreground">
                          <span>User: {event.user_id?.slice(0, 8)}...</span>
                          {event.ip_address && <span> • IP: {event.ip_address}</span>}
                          {Object.keys(event.details).length > 0 && (
                            <div className="mt-1 p-2 bg-muted rounded text-xs">
                              {Object.entries(event.details).map(([key, value]) => (
                                <div key={key}>
                                  <strong>{key}:</strong> {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}