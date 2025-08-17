import { useEffect, useState, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDeliberationService } from "@/hooks/useDeliberationService";
import { useAgentService } from "@/hooks/useServices";
import { Layout } from "@/components/layout/Layout";
import { MessageList } from "@/components/chat/MessageList";
import { IbisSubmissionModal } from "@/components/chat/IbisSubmissionModal";
import { MessageInput } from "@/components/chat/MessageInput";
import { ChatModeSelector, ChatMode } from "@/components/chat/ChatModeSelector";
const IbisMapVisualizationLazy = lazy(() => import("@/components/ibis/IbisMapVisualization").then(m => ({
  default: m.IbisMapVisualization
})));
import { useChat } from "@/hooks/useChat";
import { AdminDeliberationView } from "@/components/admin/AdminDeliberationView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ViewModeSelector } from "@/components/chat/ViewModeSelector";
import { Users, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ParticipantScoring } from "@/components/chat/ParticipantScoring";
import { useIsMobile } from "@/hooks/use-mobile";
const VoiceInterfaceLazy = lazy(() => import("@/components/chat/VoiceInterface"));
import { logger } from "@/utils/logger";

// Helper function to calculate helpfulness score from IBIS node ratings
const calculateHelpfulnessScore = async (userId: string, deliberationId: string, supabase: any): Promise<number> => {
  try {
    // Get all IBIS nodes created by this user in this deliberation
    const { data: userNodes, error: nodesError } = await supabase
      .from('ibis_nodes')
      .select('id')
      .eq('created_by', userId)
      .eq('deliberation_id', deliberationId);

    if (nodesError || !userNodes || userNodes.length === 0) {
      return 0;
    }

    const nodeIds = userNodes.map(node => node.id);

    // Get all ratings for this user's nodes
    const { data: ratings, error: ratingsError } = await supabase
      .from('ibis_node_ratings')
      .select('ibis_node_id, rating')
      .in('ibis_node_id', nodeIds)
      .eq('deliberation_id', deliberationId);

    if (ratingsError || !ratings) {
      return 0;
    }

    // Group ratings by node and calculate net positive contributions
    const nodeRatings = new Map<string, number>();
    
    ratings.forEach(rating => {
      const nodeId = rating.ibis_node_id;
      const currentSum = nodeRatings.get(nodeId) || 0;
      nodeRatings.set(nodeId, currentSum + rating.rating);
    });

    // Count nodes with net positive ratings (≥1)
    let helpfulnessScore = 0;
    nodeRatings.forEach(netRating => {
      if (netRating >= 1) {
        helpfulnessScore++;
      }
    });

    // Cap at maximum of 5
    return Math.min(5, helpfulnessScore);
  } catch (error) {
    console.error('Error calculating helpfulness score:', error);
    return 0;
  }
};

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
}
const DeliberationChat = () => {
  const {
    deliberationId
  } = useParams<{
    deliberationId: string;
  }>();
  const {
    user,
    isLoading
  } = useAuth();
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const deliberationService = useDeliberationService();
  const agentService = useAgentService();
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [agentConfigs, setAgentConfigs] = useState<Array<{agent_type: string; name: string; description?: string;}>>([]);
  const [loading, setLoading] = useState(true);
  const [isParticipant, setIsParticipant] = useState(false);
  const [joiningDeliberation, setJoiningDeliberation] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('chat');
  const [ibisModal, setIbisModal] = useState<{
    isOpen: boolean;
    messageId: string;
    messageContent: string;
  }>({
    isOpen: false,
    messageId: '',
    messageContent: ''
  });
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'chat' | 'ibis'>('chat');
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  // Scoring state - loaded from actual user activity in database
  const [userScores, setUserScores] = useState({
    engagement: 0, // Count of user messages sent total
    shares: 0, // Count of IBIS submissions total
    sessions: 1, // Count of login sessions (placeholder)
    helpfulness: 0 // Count of net positive IBIS contribution ratings
  });
  const {
    messages,
    isLoading: chatLoading,
    isTyping,
    sendMessage: originalSendMessage,
    loadChatHistory,
    retryMessage
  } = useChat(deliberationId);
  const sendMessage = async (content: string) => {
    await originalSendMessage(content, chatMode);
    // Update engagement score when message is sent
    setUserScores(prev => ({
      ...prev,
      engagement: prev.engagement + 1
    }));
  };
  const handleAddToIbis = (messageId: string, messageContent: string) => {
    setIbisModal({
      isOpen: true,
      messageId,
      messageContent
    });
  };
  const handleIbisModalClose = () => {
    setIbisModal({
      isOpen: false,
      messageId: '',
      messageContent: ''
    });
  };
  const handleIbisSuccess = () => {
    // Reload chat messages to reflect the updated submitted_to_ibis status
    loadChatHistory();
    // Update shares score when IBIS submission is successful
    setUserScores(prev => ({
      ...prev,
      shares: prev.shares + 1
    }));
  };
  useEffect(() => {
    setViewMode('chat');
  }, [isMobile]);
  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
      return;
    }
    if (user && deliberationId) {
      loadDeliberation();
      loadUserScores();
      loadAgentConfigs();
    }
  }, [user, isLoading, deliberationId, navigate]);

  // Load user scores from database
  const loadUserScores = async () => {
    if (!user?.id || !deliberationId) return;
    
    try {
      // Import supabase client
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Query user's message statistics for this deliberation
      const { data: messageStats, error } = await supabase
        .from('messages')
        .select('message_type, submitted_to_ibis')
        .eq('deliberation_id', deliberationId)
        .eq('user_id', user.id);
      
      if (error) {
        console.error('Error loading user scores:', error);
        return;
      }
      
      // Calculate scores from actual data
      const userMessages = messageStats?.filter(m => m.message_type === 'user').length || 0;
      const ibisSubmissions = messageStats?.filter(m => m.submitted_to_ibis === true).length || 0;
      
      // Calculate helpfulness score from IBIS node ratings
      const helpfulnessScore = await calculateHelpfulnessScore(user.id, deliberationId, supabase);
      
      setUserScores({
        engagement: userMessages,
        shares: ibisSubmissions,
        sessions: 1, // TODO: Calculate actual sessions from login data
        helpfulness: helpfulnessScore
      });
      
      logger.info('User scores loaded', { engagement: userMessages, shares: ibisSubmissions });
    } catch (error) {
      console.error('Failed to load user scores:', error);
    }
  };

  const loadAgentConfigs = async () => {
    if (!deliberationId) {
      console.log('No deliberationId, skipping agent config load');
      return;
    }
    
    try {
      console.log('Loading agent configs for deliberation:', deliberationId);
      const agents = await agentService.getAgentsByDeliberation(deliberationId);
      console.log('Loaded agent configs from service:', agents);
      
      const mappedConfigs = agents.map(agent => ({
        agent_type: agent.agent_type,
        name: agent.name,
        description: agent.description
      }));
      
      console.log('Setting mapped agent configs:', mappedConfigs);
      setAgentConfigs(mappedConfigs);
    } catch (error) {
      console.error('Failed to load agent configurations:', error);
    }
  };

  const loadDeliberation = async () => {
    if (!deliberationId) {
      logger.warn('No deliberationId provided');
      return;
    }
    try {
      logger.info('Loading deliberation details', {
        deliberationId
      });
      setLoading(true);
      const data = await deliberationService.getDeliberation(deliberationId);
      logger.info('Deliberation details loaded successfully', data);
      setDeliberation(data);

      // Check if current user is a participant
      const isUserParticipant = data.participants?.some((p: any) => p.user_id === user?.id);
      setIsParticipant(isUserParticipant || false);
    } catch (error) {
      console.error('❌ Failed to load deliberation details:', error);
      toast({
        title: "Error",
        description: "Failed to load deliberation details",
        variant: "destructive"
      });
      // Don't automatically redirect - let user see the error and try again
    } finally {
      setLoading(false);
      logger.info('Deliberation details loading completed');
    }
  };
  const handleJoinDeliberation = async () => {
    if (!deliberationId || !user) return;
    setJoiningDeliberation(true);
    try {
      await deliberationService.joinDeliberation(deliberationId);
      setIsParticipant(true);
      toast({
        title: "Success",
        description: "You have joined the deliberation"
      });
      // Reload deliberation to get updated participant list
      loadDeliberation();
    } catch (error) {
      logger.error('Failed to join deliberation', error as any);
      toast({
        title: "Error",
        description: "Failed to join deliberation",
        variant: "destructive"
      });
    } finally {
      setJoiningDeliberation(false);
    }
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-success';
      case 'completed':
        return 'bg-muted-foreground';
      default:
        return 'bg-warning';
    }
  };
  const ChatPanel = () => <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-hidden min-h-0">
        <MessageList messages={messages} isLoading={chatLoading} isTyping={isTyping} onAddToIbis={handleAddToIbis} onRetry={retryMessage} deliberationId={deliberationId} agentConfigs={agentConfigs} />
      </div>
      <MessageInput onSendMessage={sendMessage} disabled={chatLoading} />
    </div>;
  if (isLoading || loading) {
    return <Layout>
        <div className="h-[calc(100vh-120px)] flex items-center justify-center">
          <div className="animate-pulse text-center">
            <div className="h-8 bg-muted rounded w-48 mx-auto mb-4"></div>
            <div className="h-4 bg-muted rounded w-32 mx-auto"></div>
          </div>
        </div>
      </Layout>;
  }
  if (!user || !deliberation) return null;

  // Show simplified admin view for admin users
  if (isAdmin) {
    return <Layout>
        <AdminDeliberationView />
      </Layout>;
  }
  return <Layout>
      <div className="flex flex-col bg-background rounded-lg border h-[calc(100vh-120px)] min-h-0">
        {/* Deliberation Header - Sticky below main header */}
        <div className="border-b bg-card backdrop-blur-sm" style={{
        position: 'sticky',
        top: '64px',
        zIndex: 40,
        backgroundColor: 'hsl(var(--card) / 0.95)'
      }}>
          {/* Mobile Header - Collapsible */}
          <div className="lg:hidden">
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <h1 className="text-lg font-semibold text-democratic-blue truncate">
                  {deliberation.title}
                </h1>
                <Badge className={`${getStatusColor(deliberation.status)} text-white text-xs shrink-0`}>
                  {deliberation.status}
                </Badge>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isHeaderCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>
            
            {/* Description - Always visible under title */}
            {deliberation.description && (
              <div className="px-3 pb-3">
                <div className="rounded-lg border bg-muted/40 p-2">
                  <p className="text-xs text-muted-foreground line-clamp-2 cursor-pointer" 
                     onClick={() => setIsDescriptionOpen(true)} 
                     title="Click to view full description">
                    {deliberation.description}
                  </p>
                </div>
              </div>
            )}
            
            {!isHeaderCollapsed && (
              <div className="px-3 pb-3 space-y-3">
                {/* Mobile Controls */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/40 p-2">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Text Mode</div>
                    <ChatModeSelector mode={chatMode} onModeChange={setChatMode} variant="bare" />
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-2">
                    <div className="text-xs font-medium text-muted-foreground mb-1">View Mode</div>
                    <ViewModeSelector mode={viewMode} onModeChange={v => v && setViewMode(v)} />
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <div className="rounded-lg border bg-muted/40 p-2 flex-1">
                    <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                      <VoiceInterfaceLazy deliberationId={deliberation.id} variant="panel" />
                    </Suspense>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 flex flex-col justify-center">
                    <ParticipantScoring 
                      engagement={userScores.engagement} 
                      shares={userScores.shares} 
                      sessions={userScores.sessions}
                      helpfulness={userScores.helpfulness}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Header - Single Row */}
          <div className="hidden lg:block p-4">
            <div className="flex items-stretch gap-4">
              {/* Title Section */}
              <div className="flex-1 min-w-0">
                <div className="rounded-lg border bg-muted/40 p-3 h-32 flex flex-col justify-center">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <h1 className="text-xl font-semibold text-democratic-blue truncate">
                        {deliberation.title}
                      </h1>
                      <Badge className={`${getStatusColor(deliberation.status)} text-white text-sm shrink-0`}>
                        {deliberation.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                      <Users className="h-4 w-4" />
                      <span>{deliberation.participants?.length || deliberation.participant_count || 0}/{deliberation.max_participants}</span>
                    </div>
                  </div>
                  {deliberation.description && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-3 cursor-pointer" 
                       onClick={() => setIsDescriptionOpen(true)} 
                       title="Click to view full description">
                      {deliberation.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Modes */}
              <div className="shrink-0">
                <div className="rounded-lg border bg-muted/40 px-3 py-2 h-32 flex flex-col justify-center space-y-2">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Text Mode</div>
                    <ChatModeSelector mode={chatMode} onModeChange={setChatMode} variant="bare" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">View Mode</div>
                    <ViewModeSelector mode={viewMode} onModeChange={v => v && setViewMode(v)} />
                  </div>
                </div>
              </div>

              {/* Voice Interface */}
              <div className="shrink-0">
                <div className="rounded-lg border bg-muted/40 px-3 py-2 h-32 flex flex-col justify-center">
                  <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                    <VoiceInterfaceLazy deliberationId={deliberation.id} variant="panel" />
                  </Suspense>
                </div>
              </div>

              {/* Scores */}
              <div className="shrink-0">
                <div className="rounded-lg border bg-muted/40 px-3 py-2 h-32 flex flex-col justify-center">
                  <ParticipantScoring 
                    engagement={userScores.engagement} 
                    shares={userScores.shares} 
                    sessions={userScores.sessions}
                    helpfulness={userScores.helpfulness}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Description Modal */}
          {deliberation.description && (
            <Dialog open={isDescriptionOpen} onOpenChange={setIsDescriptionOpen}>
              <DialogContent className="max-w-none w-screen h-screen p-6 sm:p-10 overflow-hidden">
                <div className="w-full h-full flex items-center justify-center">
                  <article className="max-w-3xl text-center text-foreground whitespace-pre-wrap break-words">
                    {deliberation.description}
                  </article>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {viewMode === 'chat' ? <ChatPanel /> : <Suspense fallback={<div className="flex-1 flex items-center justify-center p-6"><div className="animate-pulse text-muted-foreground">Loading map…</div></div>}>
              <IbisMapVisualizationLazy deliberationId={deliberation.id} />
            </Suspense>}
        </div>
        
        {/* IBIS Submission Modal */}
        {deliberation && <IbisSubmissionModal isOpen={ibisModal.isOpen} onClose={handleIbisModalClose} messageId={ibisModal.messageId} messageContent={ibisModal.messageContent} deliberationId={deliberation.id} onSuccess={handleIbisSuccess} />}

      </div>
    </Layout>;
};
export default DeliberationChat;