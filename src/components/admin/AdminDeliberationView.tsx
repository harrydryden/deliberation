import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageList } from '@/components/chat/MessageList';
import { useDeliberationService } from '@/hooks/useDeliberationService';
import { useChat } from '@/hooks/useChat';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Calendar, Users, Eye } from 'lucide-react';
import { formatToUKDate } from '@/utils/timeUtils';

interface Deliberation {
  id: string;
  title: string;
  description?: string;
  status: 'draft' | 'active' | 'completed';
  facilitator_id?: string;
  is_public: boolean;
  max_participants: number;
  participants?: any[];
  participant_count?: number;
  created_at: string;
  updated_at: string;
}

export const AdminDeliberationView = () => {
  const { deliberationId } = useParams<{ deliberationId: string }>();
  const deliberationService = useDeliberationService();
  const { messages, isLoading: messagesLoading } = useChat(deliberationId);
  
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDeliberation = async () => {
      if (!deliberationId) return;
      
      try {
        setLoading(true);
        const data = await deliberationService.getDeliberation(deliberationId);
        setDeliberation(data);
      } catch (err) {
        console.error('Failed to load deliberation:', err);
        setError('Failed to load deliberation');
      } finally {
        setLoading(false);
      }
    };

    loadDeliberation();
  }, [deliberationId, deliberationService]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !deliberation) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-destructive">{error || 'Deliberation not found'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusColor = {
    draft: 'secondary',
    active: 'default',
    completed: 'outline'
  } as const;

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">{deliberation.title}</CardTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Created {formatToUKDate(deliberation.created_at)}
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {deliberation.participant_count || 0} participants
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {deliberation.is_public ? 'Public' : 'Private'}
                </div>
              </div>
            </div>
            <Badge variant={statusColor[deliberation.status]}>
              {deliberation.status.charAt(0).toUpperCase() + deliberation.status.slice(1)}
            </Badge>
          </div>
        </CardHeader>
        
        {deliberation.description && (
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <p className="text-muted-foreground whitespace-pre-wrap">
                {deliberation.description}
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Conversation History</span>
            <Badge variant="outline">
              {messages.length} messages
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Admin view - Read-only access to all messages in chronological order
          </p>
        </CardHeader>
        <CardContent>
          {messagesLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No messages in this deliberation yet.
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              <MessageList 
                messages={messages}
                isLoading={false}
                isTyping={false}
                onAddToIbis={undefined} // Disable IBIS submission for admin view
                deliberationId={deliberationId}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};