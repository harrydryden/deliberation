import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Calendar, Users, Eye, Bot, User, FileText, Workflow, ChevronDown, ChevronRight } from 'lucide-react';
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
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
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

  // Group messages by user messages and their following agent responses
  const groupMessages = (messages: ChatMessage[]) => {
    const groups: Array<{
      userMessage: ChatMessage;
      agentResponses: ChatMessage[];
    }> = [];
    
    let currentGroup: { userMessage: ChatMessage; agentResponses: ChatMessage[] } | null = null;
    
    messages.forEach(message => {
      if (message.message_type === 'user') {
        // Start a new group
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          userMessage: message,
          agentResponses: []
        };
      } else if (currentGroup) {
        // Add agent response to current group
        currentGroup.agentResponses.push(message);
      }
    });
    
    // Don't forget the last group
    if (currentGroup) {
      groups.push(currentGroup);
    }
    
    return groups;
  };

  const toggleExpanded = (messageId: string) => {
    const newExpanded = new Set(expandedMessages);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedMessages(newExpanded);
  };

  const messageGroups = groupMessages(messages);

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
              {messageGroups.map((group, groupIndex) => {
                const isExpanded = expandedMessages.has(group.userMessage.id);
                const hasAgentResponses = group.agentResponses.length > 0;

                return (
                  <div key={group.userMessage.id} className="space-y-2">
                    {/* User Message */}
                    <div 
                      className={`flex gap-3 ${hasAgentResponses ? 'cursor-pointer' : ''}`}
                      onClick={() => hasAgentResponses && toggleExpanded(group.userMessage.id)}
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="bg-primary">
                          <User className="h-4 w-4 text-white" />
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">User</span>
                          <span className="text-xs text-muted-foreground">
                            {formatToUKTime(group.userMessage.created_at)}
                          </span>
                          {group.userMessage.submitted_to_ibis && (
                            <Badge variant="default" className="text-xs bg-blue-500 hover:bg-blue-600">
                              Submitted to IBIS
                            </Badge>
                          )}
                        </div>

                        <Card className={`p-3 ${
                          group.userMessage.submitted_to_ibis 
                            ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800' 
                            : 'bg-muted'
                        }`}>
                          <div className="text-sm leading-relaxed">
                            <MarkdownMessage content={group.userMessage.content} />
                          </div>
                        </Card>

                        {hasAgentResponses && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <span>
                              {group.agentResponses.length} response{group.agentResponses.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Agent Responses (expandable) */}
                    {isExpanded && hasAgentResponses && (
                      <div className="ml-11 space-y-3">
                        {group.agentResponses.map((response) => {
                          const agentInfo = (AGENTS as any)[response.message_type] ?? AGENTS.default;
                          const AgentIcon = agentInfo.icon;

                          return (
                            <div key={response.id} className="flex gap-3">
                              <Avatar className="h-6 w-6 flex-shrink-0">
                                <AvatarFallback className={agentInfo.color}>
                                  <AgentIcon className="h-3 w-3 text-white" />
                                </AvatarFallback>
                              </Avatar>

                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium">{agentInfo.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatToUKTime(response.created_at)}
                                  </span>
                                </div>

                                <Card className="p-2 bg-card text-xs">
                                  <div className="leading-relaxed">
                                    <MarkdownMessage content={response.content} />
                                  </div>
                                </Card>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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