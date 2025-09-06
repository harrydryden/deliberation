  // 🔧 FIX: Add import for useMemo
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
  
  // Memoize services and core dependencies ONCE
  const services = useMemo(() => {
    const { agentService, messageService } = useServices();
    const deliberationService = useDeliberationService();
    const { toast } = useToast();
    return { agentService, messageService, deliberationService, toast };
  }, []); // Empty deps - services are singletons
  
  const { sessionMetrics, updateActivity } = useSessionTracking();
  const isMobile = useIsMobile();

  // Single consolidated state to minimize rerenders
  const [appState, setAppState] = useState({
    // UI State
    loading: true,
    joiningDeliberation: false,
    chatMode: 'chat' as ChatMode,
    viewMode: 'chat' as 'chat' | 'ibis',
    isDescriptionOpen: false,
    modalContent: 'description' as 'description' | 'notion',
    isHeaderCollapsed: false,
    
    // Deliberation State
    deliberation: null as Deliberation | null,
    agentConfigs: [] as Array<{agent_type: string; name: string; description?: string;}>,
    isParticipant: false,
    
    // IBIS Modal State
    ibisModal: {
      isOpen: false,
      messageId: '',
      messageContent: ''
    },
    
    // User Scores State
    userScores: {
      engagement: 0,
      shares: 0,
      sessions: 1,
      helpfulness: 0,
      stanceScore: undefined as number | undefined
    }
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
    enabled: appState.isParticipant && appState.deliberation?.status === 'active'
  });
  const sendMessage = useCallback(async (content: string) => {
    await originalSendMessage(content, appState.chatMode);
    // Update session activity for tracking and proactive prompts
    updateActivity();
    // Update engagement score when message is sent
    setAppState(prev => ({
      ...prev,
      userScores: {
        ...prev.userScores,
        engagement: prev.userScores.engagement + 1
      }
    }));
  }, [originalSendMessage, appState.chatMode, updateActivity]);
  
  const handleAddToIbis = useCallback((messageId: string, messageContent: string) => {
    setAppState(prev => ({
      ...prev,
      ibisModal: {
        isOpen: true,
        messageId,
        messageContent
      }
    }));
  }, []);
  
  const handleIbisModalClose = useCallback(() => {
    setAppState(prev => ({
      ...prev,
      ibisModal: {
        isOpen: false,
        messageId: '',
        messageContent: ''
      }
    }));
  }, []);
  const handleIbisSuccess = () => {
    // Reload chat messages to reflect the updated submitted_to_ibis status
    loadChatHistory();
    // Reload user scores to get updated stance score from IBIS submission
    loadUserScores();
  };
  // Stabilized data loading functions with minimal dependencies
  const loadUserScores = useCallback(async () => {
    if (!user?.id || !deliberationId) return;
    
    try {
      // Use message service to get user engagement metrics
      const userMessages = await services.messageService.getUserMessages(user.id);
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

      setAppState(prev => ({
        ...prev,
        userScores: {
          engagement: deliberationMessages.length,
          shares: ibisSubmissions.length,
          sessions: prev.userScores.sessions, // Keep current session count to avoid sessionMetrics dependency
          helpfulness: helpfulnessScore,
          stanceScore: stanceData?.stance_score || 0
        }
      }));
    } catch (error) {
      logger.error('Failed to load user scores', error as Error);
      setAppState(prev => ({
        ...prev,
        userScores: {
          engagement: 0,
          shares: 0,
          sessions: prev.userScores.sessions,
          helpfulness: 0,
          stanceScore: 0
        }
      }));
    }  
  }, [user?.id, deliberationId, services.messageService]);

  const loadAgentConfigs = useCallback(async () => {
    if (!deliberationId) return;
    
    try {
      const agents = await services.agentService.getAgentsByDeliberation(deliberationId);
      const mappedConfigs = agents.map(agent => ({
        agent_type: agent.agent_type,
        name: agent.name,
        description: agent.description
      }));
      
      setAppState(prev => ({ ...prev, agentConfigs: mappedConfigs }));
    } catch (error) {
      logger.error('Failed to load agent configs', error as Error);
    }
  }, [deliberationId, services.agentService]);

  const loadDeliberation = useCallback(async () => {
    if (!deliberationId) {
      logger.warn('No deliberationId provided');
      return;
    }
    try {
      setAppState(prev => ({ ...prev, loading: true }));
      const data = await services.deliberationService.getDeliberation(deliberationId);
      
      // Check if current user is a participant
      const isUserParticipant = data.participants?.some((p: any) => p.user_id === user?.id);
      
      setAppState(prev => ({
        ...prev,
        deliberation: data,
        isParticipant: isUserParticipant || false,
        loading: false
      }));
    } catch (error) {
      services.toast({
        title: "Error",
        description: "Failed to load deliberation details",
        variant: "destructive"
      });
      setAppState(prev => ({ ...prev, loading: false }));
    }
  }, [deliberationId, user?.id, services.deliberationService, services.toast]);

  // Single effect for authentication and initial data loading
  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
      return;
    }
    if (user && deliberationId) {
      // Load all data in sequence to avoid cascading renders
      (async () => {
        await loadDeliberation();
        await loadAgentConfigs();
        // Only load scores if we have deliberation data
        if (user?.id && deliberationId) {
          await loadUserScores();
        }
      })();
    }
  }, [user, isLoading, deliberationId, navigate]); // Minimal stable dependencies

  // Separate effect for mobile view mode only
  useEffect(() => {
    if (isMobile) {
      setAppState(prev => ({ ...prev, viewMode: 'chat' }));
    }
  }, [isMobile]);

  // Update session count when sessionMetrics changes
  useEffect(() => {
    if (sessionMetrics?.totalSessions) {
      setAppState(prev => ({
        ...prev,
        userScores: {
          ...prev.userScores,
          sessions: sessionMetrics.totalSessions
        }
      }));
    }
  }, [sessionMetrics?.totalSessions]);
  const handleJoinDeliberation = useCallback(async () => {
    if (!deliberationId || !user) return;
    setAppState(prev => ({ ...prev, joiningDeliberation: true }));
    try {
      await services.deliberationService.joinDeliberation(deliberationId);
      setAppState(prev => ({ ...prev, isParticipant: true }));
      services.toast({
        title: "Success",
        description: "You have joined the deliberation"
      });
      // Reload deliberation to get updated participant list
      loadDeliberation();
    } catch (error) {
      logger.error('Failed to join deliberation', error as any);
      services.toast({
        title: "Error",
        description: "Failed to join deliberation",
        variant: "destructive"
      });
    } finally {
      setAppState(prev => ({ ...prev, joiningDeliberation: false }));
    }
  }, [deliberationId, user, services.deliberationService, services.toast, loadDeliberation]);
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
        <OptimizedMessageList messages={messages} isLoading={chatLoading} isTyping={isTyping} onAddToIbis={handleAddToIbis} onRetry={retryMessage} deliberationId={deliberationId} agentConfigs={appState.agentConfigs} />
      </div>
      <MessageInput 
        onSendMessage={sendMessage} 
        disabled={chatLoading} 
      />
    </div>;
  if (isLoading || appState.loading) {
    return <Layout>
        <div className="h-[calc(100vh-120px)] flex items-center justify-center">
          <div className="animate-pulse text-center">
            <div className="h-8 bg-muted rounded w-48 mx-auto mb-4"></div>
            <div className="h-4 bg-muted rounded w-32 mx-auto"></div>
          </div>
        </div>
      </Layout>;
  }
  
  if (!user || !appState.deliberation) return null;

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
                  {appState.deliberation.title}
                </h1>
                <Badge className={`${getStatusColor(appState.deliberation.status)} text-white text-xs shrink-0`}>
                  {appState.deliberation.status}
                </Badge>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => setAppState(prev => ({ ...prev, isHeaderCollapsed: !prev.isHeaderCollapsed }))}
                className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {appState.isHeaderCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>
            
            {/* Description - Always visible under title */}
            {appState.deliberation.description && (
              <div className="px-3 pb-3">
                <div className="rounded-lg border bg-muted/40 p-2">
                   <p className="text-xs text-muted-foreground line-clamp-2 cursor-pointer" 
                      onClick={() => { setAppState(prev => ({ ...prev, modalContent: 'description', isDescriptionOpen: true })); }} 
                      title="Click to view full description">
                      <span className="font-bold">Description:</span> {appState.deliberation.description}
                    </p>
                </div>
              </div>
            )}
            
            {/* Notion Focus - Always visible under description */}
            {appState.deliberation.notion && (
              <div className="px-3 pb-3">
                <div className="rounded-lg border bg-muted/40 p-2">
                   <p className="text-xs text-muted-foreground line-clamp-2 cursor-pointer" 
                      onClick={() => { setAppState(prev => ({ ...prev, modalContent: 'notion', isDescriptionOpen: true })); }} 
                      title="Click to view full notion">
                     <span className="font-bold">Notion:</span> {appState.deliberation.notion}
                   </p>
                </div>
              </div>
            )}
            
            {!appState.isHeaderCollapsed && (
              <div className="px-3 pb-3 space-y-3">
                {/* Mobile Controls */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/40 p-2">
                    <ChatModeSelector mode={appState.chatMode} onModeChange={(mode) => setAppState(prev => ({ ...prev, chatMode: mode }))} variant="bare" />
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-2">
                    <ViewModeSelector mode={appState.viewMode} onModeChange={v => v && setAppState(prev => ({ ...prev, viewMode: v }))} />
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <div className="rounded-lg border bg-muted/40 p-2 flex-1">
                    <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                      <VoiceInterfaceLazy 
                        deliberationId={appState.deliberation.id} 
                        variant="panel" 
                        sendMessage={sendMessage} 
                      />
                    </Suspense>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 flex flex-col justify-center">
                    <ParticipantScoring 
                      engagement={appState.userScores.engagement} 
                      shares={appState.userScores.shares} 
                      sessions={appState.userScores.sessions}
                      helpfulness={appState.userScores.helpfulness}
                      stanceScore={appState.userScores.stanceScore}
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
                        {appState.deliberation.title}
                      </h1>
                      <Badge className="bg-blue-500 text-white text-sm shrink-0">
                        {appState.deliberation.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                      <Users className="h-4 w-4" />
                      <span>{appState.deliberation.participants?.length || appState.deliberation.participant_count || 0}</span>
                    </div>
                  </div>
                    {appState.deliberation.description && (
                     <p className="text-sm text-muted-foreground mt-2 line-clamp-1 cursor-pointer truncate" 
                        onClick={() => { setAppState(prev => ({ ...prev, modalContent: 'description', isDescriptionOpen: true })); }} 
                        title="Click to view full description">
                       <span className="font-bold">Description:</span> {appState.deliberation.description}
                     </p>
                  )}
                  {appState.deliberation.notion && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-1 cursor-pointer truncate" 
                       onClick={() => { setAppState(prev => ({ ...prev, modalContent: 'notion', isDescriptionOpen: true })); }} 
                       title="Click to view full notion">
                      <span className="font-bold">Notion:</span> {appState.deliberation.notion}
                    </p>
                  )}
                </div>
              </div>

              {/* Modes */}
              <div className="shrink-0">
                <div className="rounded-lg border bg-muted/40 px-3 py-2 h-32 flex flex-col justify-center space-y-2">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Text Mode</div>
                    <ChatModeSelector mode={appState.chatMode} onModeChange={(mode) => setAppState(prev => ({ ...prev, chatMode: mode }))} variant="bare" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">View Mode</div>
                    <ViewModeSelector mode={appState.viewMode} onModeChange={v => v && setAppState(prev => ({ ...prev, viewMode: v }))} />
                  </div>
                </div>
              </div>

              {/* Voice Interface */}
              <div className="shrink-0">
                <div className="rounded-lg border bg-muted/40 px-3 py-2 h-32 flex flex-col justify-center">
                  <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                    <VoiceInterfaceLazy 
                      deliberationId={appState.deliberation.id}
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
                    engagement={appState.userScores.engagement} 
                    shares={appState.userScores.shares} 
                    sessions={appState.userScores.sessions}
                    helpfulness={appState.userScores.helpfulness}
                    stanceScore={appState.userScores.stanceScore}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Content Modal */}
          {(appState.deliberation.description || appState.deliberation.notion) && (
            <Dialog open={appState.isDescriptionOpen} onOpenChange={(open) => setAppState(prev => ({ ...prev, isDescriptionOpen: open }))}>
              <DialogContent className="max-w-none w-screen h-screen p-6 sm:p-10 overflow-hidden">
                <div className="w-full h-full flex items-center justify-center">
                  <article className="max-w-3xl text-center text-foreground whitespace-pre-wrap break-words">
                    {appState.modalContent === 'description' ? appState.deliberation.description : appState.deliberation.notion}
                  </article>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {appState.viewMode === 'chat' ? <ChatPanel /> : <Suspense fallback={<div className="flex-1 flex items-center justify-center p-6"><div className="animate-pulse text-muted-foreground">Loading map…</div></div>}>
              <IbisMapVisualizationLazy deliberationId={appState.deliberation.id} />
            </Suspense>}
        </div>
        
        {/* IBIS Submission Modal */}
        {appState.deliberation && <IbisSubmissionModal isOpen={appState.ibisModal.isOpen} onClose={handleIbisModalClose} messageId={appState.ibisModal.messageId} messageContent={appState.ibisModal.messageContent} deliberationId={appState.deliberation.id} onSuccess={handleIbisSuccess} />}

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