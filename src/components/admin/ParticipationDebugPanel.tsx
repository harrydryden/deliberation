import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Bug } from 'lucide-react';

interface ParticipationDebugPanelProps {
  userId: string;
  deliberationId: string;
  isParticipant: boolean;
  joiningDeliberation: boolean;
  participants: any[];
  deliberationData: any;
  onRefresh: () => void;
}

export const ParticipationDebugPanel = ({
  userId,
  deliberationId,
  isParticipant,
  joiningDeliberation,
  participants,
  deliberationData,
  onRefresh
}: ParticipationDebugPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  
  return (
    <Card className="fixed bottom-4 right-4 max-w-sm z-50 bg-card/95 backdrop-blur-sm border-warning">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between p-3">
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4" />
              <span className="text-xs font-medium">Debug Panel</span>
            </div>
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="p-3 pt-0 space-y-3">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Participation Status</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>Is Participant:</span>
                <Badge variant={isParticipant ? "default" : "destructive"} className="text-xs">
                  {isParticipant ? "YES" : "NO"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>Joining:</span>
                <Badge variant={joiningDeliberation ? "secondary" : "outline"} className="text-xs">
                  {joiningDeliberation ? "YES" : "NO"}
                </Badge>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">User Data</div>
            <div className="bg-muted/50 rounded p-2 text-xs font-mono">
              <div>User ID: {userId.slice(0, 8)}...</div>
              <div>Deliberation: {deliberationId.slice(0, 8)}...</div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Participants ({participants.length})
            </div>
            <div className="bg-muted/50 rounded p-2 max-h-20 overflow-y-auto">
              {participants.length > 0 ? (
                participants.map((p, i) => (
                  <div key={i} className="text-xs font-mono flex items-center gap-2">
                    <span>{p.user_id?.slice(0, 8)}...</span>
                    {p.user_id === userId && (
                      <Badge variant="default" className="text-xs px-1 py-0">YOU</Badge>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">No participants</div>
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Actions</div>
            <Button onClick={onRefresh} size="sm" variant="outline" className="w-full text-xs">
              Refresh Data
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};