import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Activity, Clock, Users, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatSessionActivity, formatTimestamp } from '@/utils/timeDisplay';
import { logger } from '@/utils/logger';

interface UserSession {
  id: string;
  user_id: string;
  session_token_hash: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
  recently_active: boolean;
}

interface SessionMetrics {
  totalActiveSessions: number;
  totalUsers: number;
  recentlyActiveCount: number;
}

export const SessionsManagement: React.FC = () => {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [metrics, setMetrics] = useState<SessionMetrics>({
    totalActiveSessions: 0,
    totalUsers: 0,
    recentlyActiveCount: 0
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSessions(data || []);
      
      // Calculate metrics
      const uniqueUsers = new Set(data?.map(s => s.user_id) || []);
      const recentlyActive = data?.filter(s => s.recently_active) || [];
      
      setMetrics({
        totalActiveSessions: data?.length || 0,
        totalUsers: uniqueUsers.size,
        recentlyActiveCount: recentlyActive.length
      });
    } catch (error) {
      logger.error('Failed to load sessions', { error });
      toast({
        title: "Error",
        description: "Failed to load session data.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const cleanupInactiveSessions = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('mark-sessions-inactive');
      
      if (error) throw error;
      
      toast({
        title: "Sessions Updated",
        description: `Marked ${data?.inactiveCount || 0} sessions as inactive.`
      });
      
      await loadSessions();
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to update session activity.",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-6">Loading session data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{metrics.totalActiveSessions}</p>
                <p className="text-sm text-muted-foreground">Active Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{metrics.recentlyActiveCount}</p>
                <p className="text-sm text-muted-foreground">Recently Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{metrics.totalUsers}</p>
                <p className="text-sm text-muted-foreground">Unique Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Session Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>
                Current user sessions with anonymized activity tracking
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadSessions}>
                Refresh
              </Button>
              <Button onClick={cleanupInactiveSessions}>
                Update Activity
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No active sessions found
            </p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">
                          User {session.user_id.slice(0, 8)}
                        </div>
                        <Badge variant={session.recently_active ? "default" : "secondary"}>
                          {formatSessionActivity(session.recently_active)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Created: {formatTimestamp(session.created_at)}</span>
                      <span>Expires: {formatTimestamp(session.expires_at)}</span>
                      <span>Session: {session.session_token_hash.slice(0, 8)}...</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Privacy Notice */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 text-green-600 mt-0.5" />
            <div className="text-sm">
              <h5 className="font-medium text-green-800 mb-1">Enhanced Privacy Mode</h5>
              <p className="text-green-700">
                Session tracking has been anonymized. Only relative activity status is shown, 
                and timestamps are rounded to the nearest hour for enhanced user privacy.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SessionsManagement;