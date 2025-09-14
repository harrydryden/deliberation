import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Calendar, Users, Eye, Bot, User, FileText, Workflow, ChevronDown, ChevronRight } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { formatToUKDate, formatToUKTime } from '@/utils/timeUtils';
import { supabase } from '@/integrations/supabase/client';
import { MarkdownMessage } from '@/components/common/MarkdownMessage';
import { logger } from '@/utils/logger';
import type { ChatMessage } from '@/types/index';
interface Deliberation {
  id: string;
  title: string;
  description?: string;
  status: 'draft' | 'active' | 'concluded';
  facilitator_id?: string;
  is_public: boolean;
  max_participants: number;
  participants?: any[];
  participant_count?: number;
  created_at: string;
  updated_at: string;
}
const AGENTS = {
  bill_agent: {
    name: 'Bill',
    icon: FileText,
    color: 'bg-blue-500'
  },
  flow_agent: {
    name: 'Flo',
    icon: Workflow,
    color: 'bg-green-500'
  },
  peer_agent: {
    name: 'Pia',
    icon: Users,
    color: 'bg-purple-500'
  }
} as const;
export const AdminDeliberationView = () => {
  const {
    deliberationId
  } = useParams<{
    deliberationId: string;
  }>();
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const loadData = async () => {
      if (!deliberationId) return;
      try {
        setLoading(true);
        setMessagesLoading(true);

        // Context is now set automatically via headers

        // Load deliberation and participants separately for better control
        const [deliberationResult, participantsResult] = await Promise.all([
          supabase.from('deliberations').select('*').eq('id', deliberationId).single(), 
          supabase.from('participants').select('user_id, role, joined_at').eq('deliberation_id', deliberationId)
        ]);
        
        if (deliberationResult.error) {
          throw deliberationResult.error;
        }

        // Get messages - admin should be able to see all messages
        const messagesResult = await supabase
          .from('messages')
          .select('*')
          .eq('deliberation_id', deliberationId)
          .order('created_at', { ascending: true });
          
        if (messagesResult.error) {
          logger.error('Messages query error', messagesResult.error as Error);
          throw messagesResult.error;
        }
        
        if (deliberationResult.data) {
          // Calculate unique participants from messages since formal participants may not be recorded
          const uniqueMessageSenders = new Set(
            messagesResult.data?.filter(msg => msg.message_type === 'user')?.map(msg => msg.user_id)?.filter(Boolean)
          );
          setDeliberation({
            ...deliberationResult.data,
            participants: participantsResult.data || [],
            participant_count: Math.max(participantsResult.data?.length || 0, uniqueMessageSenders.size)
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
        logger.error('Failed to load data', err as Error);
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
    let currentGroup: {
      userMessage: ChatMessage;
      agentResponses: ChatMessage[];
    } | null = null;
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
    return <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>;
  }
  if (error || !deliberation) {
    return <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-destructive">{error || 'Deliberation not found'}</p>
          </CardContent>
        </Card>
      </div>;
  }
  const statusColor = {
    draft: 'secondary',
    active: 'default',
    completed: 'outline'
  } as const;
  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Header */}
      <Card className="mb-4">
        <CardHeader className="py-[2px]">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">{deliberation.title}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
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
        
        {deliberation.description && <CardContent>
            <Collapsible open={descriptionExpanded} onOpenChange={setDescriptionExpanded}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:text-primary transition-colors">
                {descriptionExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="text-sm font-medium">Description</span>
                {!descriptionExpanded && <span className="text-xs text-muted-foreground truncate flex-1">
                    {deliberation.description.slice(0, 100)}...
                  </span>}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="prose prose-sm max-w-none">
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {deliberation.description}
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>}
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
          {messagesLoading ? <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div> : messages.length === 0 ? <div className="text-center py-8 text-muted-foreground">
              No messages in this deliberation yet.
            </div> : <div className="max-h-[600px] overflow-y-auto space-y-4">
              {messageGroups.map((group, groupIndex) => {
            const isExpanded = expandedMessages.has(group.userMessage.id);
            const hasAgentResponses = group.agentResponses.length > 0;
            return <div key={group.userMessage.id} className="space-y-2">
                    {/* User Message */}
                    <div className={`flex gap-3 ${hasAgentResponses ? 'cursor-pointer' : ''}`} onClick={() => hasAgentResponses && toggleExpanded(group.userMessage.id)}>
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="bg-primary">
                          <User className="h-4 w-4 text-white" />
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">User</span>
                          <span className="text-xs text-muted-foreground">
                            {formatToUKTime(group.userMessage.created_at, 'HH:mm')}
                          </span>
                          {group.userMessage.submitted_to_ibis && <Badge variant="default" className="text-xs bg-blue-500 hover:bg-blue-600">
                              Submitted to IBIS
                            </Badge>}
                        </div>

                        <Card className={`p-3 ${group.userMessage.submitted_to_ibis ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800' : 'bg-muted'}`}>
                          <div className="text-sm leading-relaxed">
                            <MarkdownMessage content={group.userMessage.content} />
                          </div>
                        </Card>

                        {hasAgentResponses && <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <span>
                              {group.agentResponses.length} agent response{group.agentResponses.length !== 1 ? 's' : ''}
                            </span>
                          </div>}
                      </div>
                    </div>
                    
                    {/* Agent Responses (expandable) */}
                    {isExpanded && hasAgentResponses && <div className="ml-11 space-y-3">
                        {group.agentResponses.map(response => {
                  const agentInfo = (AGENTS as any)[response.message_type];
                  if (!agentInfo) {
                    logger.warn(`Unknown agent type: ${response.message_type}`, { messageType: response.message_type, responseId: response.id });
                    return null; // Skip unknown agent types
                  }
                  const AgentIcon = agentInfo.icon;
                  return <div key={response.id} className="flex gap-3">
                              <Avatar className="h-6 w-6 flex-shrink-0">
                                <AvatarFallback className={agentInfo.color}>
                                  <AgentIcon className="h-3 w-3 text-white" />
                                </AvatarFallback>
                              </Avatar>

                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium">{agentInfo.name}</span>
                                   <span className="text-xs text-muted-foreground">
                                     {formatToUKTime(response.created_at, 'HH:mm')}
                                   </span>
                                </div>

                                <Card className="p-2 bg-card text-xs">
                                  <div className="leading-relaxed">
                                    <MarkdownMessage content={response.content} />
                                  </div>
                                </Card>
                              </div>
                            </div>;
                }).filter(Boolean)}
                      </div>}
                  </div>;
          })}
            </div>}
        </CardContent>
      </Card>
    </div>
  );
};