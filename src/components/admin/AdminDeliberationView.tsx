import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Calendar, Users, Eye, Bot, User, FileText, Workflow } from 'lucide-react';
import { formatToUKDate, formatToUKTime } from '@/utils/timeUtils';
import { supabase } from '@/integrations/supabase/client';
import { MarkdownMessage } from '@/components/common/MarkdownMessage';
import type { ChatMessage } from '@/types/chat';

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

const AGENTS = {
  bill_agent: { name: 'Bill', icon: FileText, color: 'bg-blue-500' },
  flow_agent: { name: 'Flo', icon: Workflow, color: 'bg-green-500' },
  peer_agent: { name: 'Pia', icon: Users, color: 'bg-purple-500' },
  default: { name: 'AI Assistant', icon: Bot, color: 'bg-gray-500' }
} as const;

export const AdminDeliberationView = () => {
  const { deliberationId } = useParams<{ deliberationId: string }>();
  
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!deliberationId) return;
      
      try {
        setLoading(true);
        setMessagesLoading(true);
        
        // Load deliberation and messages in parallel
        const [deliberationResult, messagesResult] = await Promise.all([
          supabase
            .from('deliberations')
            .select(`
              *,
              participants(user_id, role, joined_at)
            `)
            .eq('id', deliberationId)
            .single(),
          supabase
            .from('messages')
            .select('*')
            .eq('deliberation_id', deliberationId)
            .order('created_at', { ascending: true })
        ]);

        if (deliberationResult.error) {
          throw deliberationResult.error;
        }

        if (messagesResult.error) {
          throw messagesResult.error;
        }

        if (deliberationResult.data) {
          setDeliberation({
            ...deliberationResult.data,
            participant_count: deliberationResult.data.participants?.length || 0
          });
        }

        // Convert messages to ChatMessage format
        const chatMessages: ChatMessage[] = messagesResult.data.map(msg => ({
          id: msg.id,
          content: msg.content,
          message_type: msg.message_type,
          created_at: msg.created_at,
          user_id: msg.user_id,
          submitted_to_ibis: msg.submitted_to_ibis || false,
          agent_context: msg.agent_context
        }));

        setMessages(chatMessages);
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('Failed to load deliberation');
      } finally {
        setLoading(false);
        setMessagesLoading(false);
      }
    };

    loadData();
  }, [deliberationId]);

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
            <div className="max-h-[600px] overflow-y-auto space-y-4">
              {messages.map((message, index) => {
                const isUser = message.message_type === 'user';
                const agentInfo = isUser ? null : ((AGENTS as any)[message.message_type] ?? AGENTS.default);
                const AgentIcon = (agentInfo?.icon as any) || Bot;

                return (
                  <div key={message.id} className="flex gap-3">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className={isUser ? 'bg-primary' : agentInfo?.color}>
                        {isUser ? <User className="h-4 w-4 text-white" /> : <AgentIcon className="h-4 w-4 text-white" />}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">
                          {isUser ? 'User' : agentInfo?.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatToUKTime(message.created_at)}
                        </span>
                        {message.submitted_to_ibis && (
                          <Badge variant="default" className="text-xs bg-blue-500 hover:bg-blue-600">
                            Submitted to IBIS
                          </Badge>
                        )}
                      </div>

                      <Card className={`p-3 ${
                        message.submitted_to_ibis 
                          ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800' 
                          : isUser 
                            ? 'bg-muted' 
                            : 'bg-card'
                      }`}>
                        <div className="text-sm leading-relaxed">
                          <MarkdownMessage content={message.content} />
                        </div>
                      </Card>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};