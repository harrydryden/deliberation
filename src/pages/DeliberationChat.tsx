import { useEffect, useState, lazy, Suspense, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useDeliberationService } from "@/hooks/useDeliberationService";
import { useServices } from "@/hooks/useServices";
import { Layout } from "@/components/layout/Layout";
import { IbisSubmissionModal } from "@/components/chat/IbisSubmissionModal";
import { MessageInput } from "@/components/chat/MessageInput";
import { ChatModeSelector, ChatMode } from "@/components/chat/ChatModeSelector";
import { useSessionTracking } from "@/hooks/useSessionTracking";
import { usePerformanceOptimization } from "@/hooks/usePerformanceOptimization";
import { ExpandableText } from "@/components/common/ExpandableText";
const IbisMapVisualizationLazy = lazy(() => import("@/components/ibis/IbisMapVisualization").then(m => ({
  default: m.IbisMapVisualization
})));
import { useChat } from "@/hooks/useChat";
import { AdminDeliberationView } from "@/components/admin/AdminDeliberationView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ViewModeSelector } from "@/components/chat/ViewModeSelector";
import { Users, ChevronDown, ChevronUp, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ParticipantScoring } from "@/components/chat/ParticipantScoring";
import { useIsMobile } from "@/hooks/use-mobile";
const VoiceInterfaceLazy = lazy(() => import("@/components/chat/VoiceInterface"));
import { logger } from "@/utils/logger";
import { useEnhancedProactivePrompts } from "@/hooks/useEnhancedProactivePrompts";
import { OptimizedMessageList } from "@/components/chat/OptimizedMessageList";
import { ProactivePrompt } from "@/components/chat/ProactivePrompt";
import { supabase } from "@/integrations/supabase/client";

interface Deliberation {
  id: string;
  title: string;
  description?: string;
  notion?: string;
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
    isLoading,
    isAdmin
  } = useSupabaseAuth();
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  
  // Use the service container directly to avoid creating new instances on every render
  const { agentService, messageService } = useServices();
  const deliberationService = useDeliberationService();
  
  const { sessionMetrics, updateActivity } = useSessionTracking();
  const { createOptimizedCallback } = usePerformanceOptimization({
    componentName: 'DeliberationChat',
    enableLogging: false, // Disable logging to reduce overhead
    memoryThreshold: 100 // Higher threshold
  });
  // Combine related state to reduce re-renders
  const [uiState, setUiState] = useState({
    loading: true,
    joiningDeliberation: false,
    chatMode: 'chat' as ChatMode,
    viewMode: 'chat' as 'chat' | 'ibis',
    isDescriptionOpen: false,
    modalContent: 'description' as 'description' | 'notion',
    isHeaderCollapsed: false
  });
  
  const [deliberationState, setDeliberationState] = useState({
    deliberation: null as Deliberation | null,
    agentConfigs: [] as Array<{agent_type: string; name: string; description?: string;}>,
    isParticipant: false
  });
  
  const [ibisModal, setIbisModal] = useState({
    isOpen: false,
    messageId: '',
    messageContent: ''
  });
  
  const isMobile = useIsMobile();
  

  // Scoring state - loaded from actual user activity in database (removed sessionMetrics dependency)
  const [userScores, setUserScores] = useState({
    engagement: 0, // Count of user messages sent total
    shares: 0, // Count of IBIS submissions total
    sessions: 1, // Will be updated when session metrics load
    helpfulness: 0, // Count of net positive IBIS contribution ratings
    stanceScore: undefined as number | undefined // User's stance towards deliberation topic (-1.0 to 1.0)
  });
  const {
    messages,
    isLoading: chatLoading,
    isTyping,
    sendMessage: originalSendMessage,
    loadChatHistory,
    retryMessage
  } = useChat(deliberationId);

  // Enhanced proactive prompts hook with session tracking integration
  const {
    currentPrompt,
    handlePromptResponse,
    handlePromptDismiss,
    handlePromptOptOut,
    facilitatorSession,
    isEnabled: proactivePromptsEnabled
  } = useEnhancedProactivePrompts({
    userId: user?.id || '',
    deliberationId: deliberationId || '',
    enabled: deliberationState.isParticipant && deliberationState.deliberation?.status === 'active'
  });
  const sendMessage = useCallback(async (content: string) => {
    await originalSendMessage(content, uiState.chatMode);
    // Update session activity for tracking and proactive prompts
    updateActivity();
    // Update engagement score when message is sent
    setUserScores(prev => ({
      ...prev,
      engagement: prev.engagement + 1
    }));
  }, [originalSendMessage, uiState.chatMode, updateActivity]);
  const handleAddToIbis = useCallback((messageId: string, messageContent: string) => {
    setIbisModal({
      isOpen: true,
      messageId,
      messageContent
    });
  }, []);
  
  const handleIbisModalClose = useCallback(() => {
    setIbisModal({
      isOpen: false,
      messageId: '',
      messageContent: ''
    });
  }, []);
  const handleIbisSuccess = () => {
    // Reload chat messages to reflect the updated submitted_to_ibis status
    loadChatHistory();
    // Reload user scores to get updated stance score from IBIS submission
    loadUserScores();
  };
  useEffect(() => {
    setUiState(prev => ({ ...prev, viewMode: 'chat' }));
  }, [isMobile]);
  
  // Stable loadUserScores without sessionMetrics dependency to prevent re-render cycles
  const loadUserScores = useCallback(async () => {
    if (!user?.id || !deliberationId) return;
    
    try {
      // Use message service to get user engagement metrics
      const userMessages = await messageService.getUserMessages(user.id);
      const deliberationMessages = userMessages.filter(m => m.deliberation_id === deliberationId);
      const ibisSubmissions = deliberationMessages.filter(m => m.submitted_to_ibis);

      // Get stance score from user_stance_scores table
      const { data: stanceData } = await supabase
        .from('user_stance_scores')
        .select('stance_score, confidence_score')
        .eq('user_id', user.id)
        .eq('deliberation_id', deliberationId)
        .maybeSingle();

      // Get user's helpfulness score from agent_ratings table  
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('agent_ratings')
        .select('rating')
        .eq('user_id', user.id);

      let helpfulnessScore = 0;
      if (!ratingsError && ratingsData) {
        // Calculate net positive ratings (helpful - unhelpful)
        const helpfulRatings = ratingsData.filter(r => r.rating === 1).length;
        const unhelpfulRatings = ratingsData.filter(r => r.rating === -1).length;
        helpfulnessScore = Math.max(0, helpfulRatings - unhelpfulRatings);
      }

      setUserScores(prev => ({
        engagement: deliberationMessages.length,
        shares: ibisSubmissions.length,
        sessions: prev.sessions, // Keep current session count to avoid sessionMetrics dependency
        helpfulness: helpfulnessScore,
        stanceScore: stanceData?.stance_score || 0
      }));
      
      logger.info('User scores loaded successfully', {
        engagement: deliberationMessages.length,
        shares: ibisSubmissions.length,
        stanceScore: stanceData?.stance_score || 0
      });
    } catch (error) {
      logger.error('Failed to load user scores', error as Error);
      setUserScores(prev => ({
        engagement: 0,
        shares: 0,
        sessions: prev.sessions,
        helpfulness: 0,
        stanceScore: 0
      }));
    }  
  }, [user?.id, deliberationId, messageService]);

  const loadAgentConfigs = useCallback(async () => {
    if (!deliberationId) {
      return;
    }
    
    try {
      const agents = await agentService.getAgentsByDeliberation(deliberationId);
      const mappedConfigs = agents.map(agent => ({
        agent_type: agent.agent_type,
        name: agent.name,
        description: agent.description
      }));
      
      setDeliberationState(prev => ({ ...prev, agentConfigs: mappedConfigs }));
    } catch (error) {

    }
  }, [deliberationId, agentService]);

  const loadDeliberation = useCallback(async () => {
    if (!deliberationId) {
      logger.warn('No deliberationId provided');
      return;
    }
    try {
      logger.info('Loading deliberation details', {
        deliberationId
      });
      setUiState(prev => ({ ...prev, loading: true }));
      const data = await deliberationService.getDeliberation(deliberationId);
      logger.info('Deliberation details loaded successfully', data);
      
      // Check if current user is a participant
      const isUserParticipant = data.participants?.some((p: any) => p.user_id === user?.id);
      
      // Use functional update to avoid dependency on deliberationState
      setDeliberationState(prev => ({
        ...prev,
        deliberation: data,
        isParticipant: isUserParticipant || false
      }));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load deliberation details",
        variant: "destructive"
      });
      // Don't automatically redirect - let user see the error and try again
    } finally {
      setUiState(prev => ({ ...prev, loading: false }));
      logger.info('Deliberation details loading completed');
    }
  }, [deliberationId, user?.id, deliberationService, toast]);

  useEffect(() => {
    console.log('DeliberationChat: Initial mount or key dependencies changed');
    if (!isLoading && !user) {
      navigate("/auth");
      return;
    }
    if (user && deliberationId) {
      loadDeliberation();
      loadAgentConfigs();
    }
  }, [user, isLoading, deliberationId, navigate, loadDeliberation, loadAgentConfigs]);

  // Update session count when sessionMetrics changes
  useEffect(() => {
    if (sessionMetrics?.totalSessions) {
      setUserScores(prev => ({
        ...prev,
        sessions: sessionMetrics.totalSessions
      }));
    }
  }, [sessionMetrics?.totalSessions]);

  // Separate effect for loading user scores to avoid circular dependencies
  useEffect(() => {
    if (user?.id && deliberationId && deliberationState.deliberation) {
      loadUserScores();
    }
  }, [user?.id, deliberationId, deliberationState.deliberation?.id, loadUserScores]);
  const handleJoinDeliberation = useCallback(async () => {
    if (!deliberationId || !user) return;
    setUiState(prev => ({ ...prev, joiningDeliberation: true }));
    try {
      await deliberationService.joinDeliberation(deliberationId);
      setDeliberationState(prev => ({ ...prev, isParticipant: true }));
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
      setUiState(prev => ({ ...prev, joiningDeliberation: false }));
    }
  }, [deliberationId, user, deliberationService, toast, loadDeliberation]);
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
        <OptimizedMessageList messages={messages} isLoading={chatLoading} isTyping={isTyping} onAddToIbis={handleAddToIbis} onRetry={retryMessage} deliberationId={deliberationId} agentConfigs={deliberationState.agentConfigs} />
      </div>
      <MessageInput 
        onSendMessage={sendMessage} 
        disabled={chatLoading} 
      />
    </div>;
  if (isLoading || uiState.loading) {
    return <Layout>
        <div className="h-[calc(100vh-120px)] flex items-center justify-center">
          <div className="animate-pulse text-center">
            <div className="h-8 bg-muted rounded w-48 mx-auto mb-4"></div>
            <div className="h-4 bg-muted rounded w-32 mx-auto"></div>
          </div>
        </div>
      </Layout>;
  }
  
  // Add emergency refresh if component seems stuck
  if (!deliberationState.deliberation && !uiState.loading && user && deliberationId) {
    console.log('DeliberationChat: Emergency state - refreshing page');
    window.location.reload();
    return null;
  }
  
  if (!user || !deliberationState.deliberation) return null;

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
                  {deliberationState.deliberation.title}
                </h1>
                <Badge className={`${getStatusColor(deliberationState.deliberation.status)} text-white text-xs shrink-0`}>
                  {deliberationState.deliberation.status}
                </Badge>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => setUiState(prev => ({ ...prev, isHeaderCollapsed: !prev.isHeaderCollapsed }))}
                className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {uiState.isHeaderCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>
            
            {/* Description - Always visible under title */}
            {deliberationState.deliberation.description && (
              <div className="px-3 pb-3">
                <div className="rounded-lg border bg-muted/40 p-2">
                   <p className="text-xs text-muted-foreground line-clamp-2 cursor-pointer" 
                      onClick={() => { setUiState(prev => ({ ...prev, modalContent: 'description', isDescriptionOpen: true })); }} 
                      title="Click to view full description">
                      <span className="font-bold">Description:</span> {deliberationState.deliberation.description}
                    </p>
                </div>
              </div>
            )}
            
            {/* Notion Focus - Always visible under description */}
            {deliberationState.deliberation.notion && (
              <div className="px-3 pb-3">
                <div className="rounded-lg border bg-muted/40 p-2">
                   <p className="text-xs text-muted-foreground line-clamp-2 cursor-pointer" 
                      onClick={() => { setUiState(prev => ({ ...prev, modalContent: 'notion', isDescriptionOpen: true })); }} 
                      title="Click to view full notion">
                     <span className="font-bold">Notion:</span> {deliberationState.deliberation.notion}
                   </p>
                </div>
              </div>
            )}
            
            {!uiState.isHeaderCollapsed && (
              <div className="px-3 pb-3 space-y-3">
                {/* Mobile Controls */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/40 p-2">
                    <ChatModeSelector mode={uiState.chatMode} onModeChange={(mode) => setUiState(prev => ({ ...prev, chatMode: mode }))} variant="bare" />
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-2">
                    <ViewModeSelector mode={uiState.viewMode} onModeChange={v => v && setUiState(prev => ({ ...prev, viewMode: v }))} />
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <div className="rounded-lg border bg-muted/40 p-2 flex-1">
                    <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                      <VoiceInterfaceLazy 
                        deliberationId={deliberationState.deliberation.id} 
                        variant="panel" 
                        sendMessage={sendMessage} 
                      />
                    </Suspense>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 flex flex-col justify-center">
                    <ParticipantScoring 
                      engagement={userScores.engagement} 
                      shares={userScores.shares} 
                      sessions={userScores.sessions}
                      helpfulness={userScores.helpfulness}
                      stanceScore={userScores.stanceScore}
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
                      <h1 className="text-lg font-semibold text-democratic-blue truncate">
                        {deliberationState.deliberation.title}
                      </h1>
                      <Badge className="bg-blue-500 text-white text-sm shrink-0">
                        {deliberationState.deliberation.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                      <Users className="h-4 w-4" />
                      <span>{deliberationState.deliberation.participants?.length || deliberationState.deliberation.participant_count || 0}</span>
                    </div>
                  </div>
                    {deliberationState.deliberation.description && (
                     <p className="text-sm text-muted-foreground mt-2 line-clamp-1 cursor-pointer truncate" 
                        onClick={() => { setUiState(prev => ({ ...prev, modalContent: 'description', isDescriptionOpen: true })); }} 
                        title="Click to view full description">
                       <span className="font-bold">Description:</span> {deliberationState.deliberation.description}
                     </p>
                  )}
                  {deliberationState.deliberation.notion && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-1 cursor-pointer truncate" 
                       onClick={() => { setUiState(prev => ({ ...prev, modalContent: 'notion', isDescriptionOpen: true })); }} 
                       title="Click to view full notion">
                      <span className="font-bold">Notion:</span> {deliberationState.deliberation.notion}
                    </p>
                  )}
                </div>
              </div>

              {/* Modes */}
              <div className="shrink-0">
                <div className="rounded-lg border bg-muted/40 px-3 py-2 h-32 flex flex-col justify-center space-y-2">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Text Mode</div>
                    <ChatModeSelector mode={uiState.chatMode} onModeChange={(mode) => setUiState(prev => ({ ...prev, chatMode: mode }))} variant="bare" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">View Mode</div>
                    <ViewModeSelector mode={uiState.viewMode} onModeChange={v => v && setUiState(prev => ({ ...prev, viewMode: v }))} />
                  </div>
                </div>
              </div>

              {/* Voice Interface */}
              <div className="shrink-0">
                <div className="rounded-lg border bg-muted/40 px-3 py-2 h-32 flex flex-col justify-center">
                  <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                    <VoiceInterfaceLazy 
                      deliberationId={deliberationState.deliberation.id}
                      variant="panel" 
                      sendMessage={sendMessage} 
                    />
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
                    stanceScore={userScores.stanceScore}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Content Modal */}
          {(deliberationState.deliberation.description || deliberationState.deliberation.notion) && (
            <Dialog open={uiState.isDescriptionOpen} onOpenChange={(open) => setUiState(prev => ({ ...prev, isDescriptionOpen: open }))}>
              <DialogContent className="max-w-none w-screen h-screen p-6 sm:p-10 overflow-hidden">
                <div className="w-full h-full flex items-center justify-center">
                  <article className="max-w-3xl text-center text-foreground whitespace-pre-wrap break-words">
                    {uiState.modalContent === 'description' ? deliberationState.deliberation.description : deliberationState.deliberation.notion}
                  </article>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {uiState.viewMode === 'chat' ? <ChatPanel /> : <Suspense fallback={<div className="flex-1 flex items-center justify-center p-6"><div className="animate-pulse text-muted-foreground">Loading map…</div></div>}>
              <IbisMapVisualizationLazy deliberationId={deliberationState.deliberation.id} />
            </Suspense>}
        </div>
        
        {/* IBIS Submission Modal */}
        {deliberationState.deliberation && <IbisSubmissionModal isOpen={ibisModal.isOpen} onClose={handleIbisModalClose} messageId={ibisModal.messageId} messageContent={ibisModal.messageContent} deliberationId={deliberationState.deliberation.id} onSuccess={handleIbisSuccess} />}

        {/* Proactive Prompt Modal */}
        {currentPrompt && (
          <ProactivePrompt
            isOpen={true}
            question={currentPrompt.question}
            context={currentPrompt.context}
            onRespond={handlePromptResponse}
            onDismiss={handlePromptDismiss}
            onOptOut={handlePromptOptOut}
          />
        )}

      </div>
    </Layout>;
};
export default DeliberationChat;