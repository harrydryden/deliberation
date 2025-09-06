import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Shield, Database, Clock, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ANONYMITY_CONFIG } from '@/utils/anonymityUtils';
import { productionLogger } from '@/utils/productionLogger';

interface AnonymityDashboardProps {
  className?: string;
}

export const AnonymityDashboard: React.FC<AnonymityDashboardProps> = ({ 
  className 
}) => {
  const [isAnonymizing, setIsAnonymizing] = useState(false);
  const { toast } = useToast();

  const handleAnonymizeOldData = async () => {
    setIsAnonymizing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('anonymize-sessions');
      
      if (error) {
        productionLogger.error('Failed to anonymize old data', error);
        toast({
          title: "Anonymization Failed",
          description: "Failed to anonymize old session data. Please try again.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Data Anonymized",
        description: `Successfully anonymized old data. ${data.expiredSessionsCleaned} sessions cleaned, ${data.auditLogsCleaned} audit logs cleaned.`,
      });

    } catch (error) {
      productionLogger.error('Error during anonymization', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred during anonymization.",
        variant: "destructive"
      });
    } finally {
      setIsAnonymizing(false);
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            User Anonymity & Privacy
          </CardTitle>
          <CardDescription>
            Current anonymity settings and data privacy controls for enhanced user protection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Current Settings */}
          <div>
            <h4 className="text-sm font-medium mb-3">Current Anonymity Settings</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <UserX className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">User Agent Collection</span>
                </div>
                <Badge variant={ANONYMITY_CONFIG.COLLECT_USER_AGENTS ? "destructive" : "default"}>
                  {ANONYMITY_CONFIG.COLLECT_USER_AGENTS ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">IP Address Tracking</span>
                </div>
                <Badge variant={ANONYMITY_CONFIG.COLLECT_IP_ADDRESSES ? "destructive" : "default"}>
                  {ANONYMITY_CONFIG.COLLECT_IP_ADDRESSES ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Precise Timestamps</span>
                </div>
                <Badge variant={ANONYMITY_CONFIG.USE_PRECISE_TIMESTAMPS ? "secondary" : "default"}>
                  {ANONYMITY_CONFIG.USE_PRECISE_TIMESTAMPS ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Session Retention</span>
                </div>
                <Badge variant="outline">
                  {ANONYMITY_CONFIG.SESSION_RETENTION_DAYS} days
                </Badge>
              </div>

            </div>
          </div>

          <Separator />

          {/* Data Anonymization Actions */}
          <div>
            <h4 className="text-sm font-medium mb-3">Data Anonymization</h4>
            <div className="space-y-4">
              
              <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-medium">Anonymize Old Session Data</h5>
                    <p className="text-xs text-muted-foreground mt-1">
                      Remove personally identifiable information from sessions older than {ANONYMITY_CONFIG.SESSION_RETENTION_DAYS} days
                    </p>
                  </div>
                  <Button 
                    onClick={handleAnonymizeOldData}
                    disabled={isAnonymizing}
                    variant="outline"
                    size="sm"
                  >
                    {isAnonymizing ? "Anonymizing..." : "Run Now"}
                  </Button>
                </div>
              </div>

              <div className="p-4 border rounded-lg bg-muted/50">
                <div className="flex items-start gap-3">
                  <Shield className="h-4 w-4 text-green-600 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-medium text-green-800">Privacy Enhancements Active</h5>
                    <ul className="text-xs text-green-700 mt-1 space-y-1">
                      <li>• User agents are no longer collected or stored</li>
                      <li>• IP addresses are no longer tracked</li>
                      <li>• Session tokens are automatically anonymized after {ANONYMITY_CONFIG.SESSION_RETENTION_DAYS} days</li>
                      <li>• Audit logs are cleaned up regularly to minimize data retention</li>
                      <li>• Timestamps are rounded to reduce tracking granularity</li>
                    </ul>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  );
};

export default AnonymityDashboard;