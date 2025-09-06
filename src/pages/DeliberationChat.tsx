import { useEffect, useState, lazy, Suspense, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { IbisSubmissionModal } from "@/components/chat/IbisSubmissionModal";
import { MessageInput } from "@/components/chat/MessageInput";
import { ChatModeSelector, ChatMode } from "@/components/chat/ChatModeSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ViewModeSelector } from "@/components/chat/ViewModeSelector";
import { Users, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ParticipantScoring } from "@/components/chat/ParticipantScoring";
import { useIsMobile } from "@/hooks/use-mobile";
import { OptimizedMessageList } from "@/components/chat/OptimizedMessageList";
import { useOptimizedAuthContext } from "@/components/auth/OptimizedAuthProvider";
import { useOptimizedDeliberationService } from "@/hooks/useOptimizedDeliberationService";
import { useStableServices } from "@/hooks/useStableServices";
import { useChat } from "@/hooks/useChat";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { supabase } from "@/integrations/supabase/client";

const IbisMapVisualizationLazy = lazy(() => import("@/components/ibis/IbisMapVisualization").then(m => ({
  default: m.IbisMapVisualization
})));

const VoiceInterfaceLazy = lazy(() => import("@/components/chat/VoiceInterface"));

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

const OptimizedDeliberationChat = () => {
  const { deliberationId } = useParams<{ deliberationId: string }>();
  const { user, isLoading, isAdmin } = useOptimizedAuthContext();
  const navigate = useNavigate();
  const { toast } = useToast();
  const deliberationService = useOptimizedDeliberationService();
  const { messageService, agentService } = useStableServices();
  const isMobile = useIsMobile();

  // Consolidated state
  const [state, setState] = useState({
    loading: true,
    deliberation: null as Deliberation | null,
    isParticipant: false,
    agentConfigs: [] as Array<{agent_type: string; name: string; description?: string;}>,
    chatMode: 'chat' as ChatMode,
    viewMode: 'chat' as 'chat' | 'ibis',
    isDescriptionOpen: false,
    modalContent: 'description' as 'description' | 'notion',
    isHeaderCollapsed: false,
    userScores: {
      engagement: 0,
      shares: 0,
      sessions: 1,
      helpfulness: 0,
      stanceScore: 0
    },
    ibisModal: {
      isOpen: false,
      messageId: '',
      messageContent: ''
    }
  });

  // Use refs for values needed in callbacks
  const chatModeRef = useRef<ChatMode>('chat');
  chatModeRef.current = state.chatMode;

  const {
    messages,
    isLoading: chatLoading,
    isTyping,
    sendMessage: originalSendMessage,
    loadChatHistory,
    retryMessage
  } = useChat(deliberationId);

  // Optimized sendMessage
  const sendMessage = useCallback(async (content: string) => {
    await originalSendMessage(content, chatModeRef.current);
    setState(prev => ({
      ...prev,
      userScores: {
        ...prev.userScores,
        engagement: prev.userScores.engagement + 1
      }
    }));
  }, [originalSendMessage]);

  // Load deliberation data
  const loadDeliberation = useCallback(async () => {
    if (!deliberationId || !user) return;

    try {
      setState(prev => ({ ...prev, loading: true }));
      
      const [deliberationData, agentsData] = await Promise.all([
        deliberationService.getDeliberation(deliberationId),
        agentService.getAgentsByDeliberation(deliberationId)
      ]);

      logger.info('Deliberation data loaded:', { 
        title: deliberationData.title,
        hasDescription: !!deliberationData.description,
        hasNotion: !!deliberationData.notion,
        description: deliberationData.description?.slice(0, 100) + '...',
        notion: deliberationData.notion
      });

      const isUserParticipant = deliberationData.participants?.some((p: any) => p.user_id === user.id) || false;
      
      const mappedConfigs = agentsData.map(agent => ({
        agent_type: agent.agent_type,
        name: agent.name,
        description: agent.description
      }));

      setState(prev => ({
        ...prev,
        deliberation: deliberationData,
        isParticipant: isUserParticipant,
        agentConfigs: mappedConfigs,
        loading: false
      }));

      // Load user scores
      if (user.id) {
        try {
          const userMessages = await messageService.getUserMessages(user.id);
          const deliberationMessages = userMessages.filter(m => m.deliberation_id === deliberationId);
          const ibisSubmissions = deliberationMessages.filter(m => m.submitted_to_ibis);

          const { data: stanceData } = await supabase
            .from('user_stance_scores')
            .select('stance_score')
            .eq('user_id', user.id)
            .eq('deliberation_id', deliberationId)
            .maybeSingle();

          setState(prev => ({
            ...prev,
            userScores: {
              engagement: deliberationMessages.length,
              shares: ibisSubmissions.length,
              sessions: 1,
              helpfulness: 0,
              stanceScore: stanceData?.stance_score || 0
            }
          }));
        } catch (error) {
          logger.error('Failed to load user scores', error as Error);
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load deliberation details",
        variant: "destructive"
      });
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [deliberationId, user, deliberationService, agentService, messageService, toast]);

  // Join deliberation
  const handleJoinDeliberation = useCallback(async () => {
    if (!deliberationId || !user) return;
    
    try {
      await deliberationService.joinDeliberation(deliberationId);
      setState(prev => ({ ...prev, isParticipant: true }));
      toast({
        title: "Success",
        description: "You have joined the deliberation"
      });
      loadDeliberation();
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to join deliberation",
        variant: "destructive"
      });
    }
  }, [deliberationId, user, deliberationService, toast, loadDeliberation]);

  // IBIS handlers
  const handleAddToIbis = useCallback((messageId: string, messageContent: string) => {
    setState(prev => ({
      ...prev,
      ibisModal: { isOpen: true, messageId, messageContent }
    }));
  }, []);

  const handleIbisModalClose = useCallback(() => {
    setState(prev => ({
      ...prev,
      ibisModal: { isOpen: false, messageId: '', messageContent: '' }
    }));
  }, []);

  const handleIbisSuccess = useCallback(() => {
    loadChatHistory();
    loadDeliberation();
  }, [loadChatHistory, loadDeliberation]);

  // Load data on mount
  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
      return;
    }
    if (user && deliberationId) {
      loadDeliberation();
    }
  }, [user, isLoading, deliberationId, navigate, loadDeliberation]);

  // Mobile view mode
  useEffect(() => {
    if (isMobile) {
      setState(prev => ({ ...prev, viewMode: 'chat' }));
    }
  }, [isMobile]);

  // Status color helper
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-success';
      case 'completed': return 'bg-muted-foreground';
      default: return 'bg-warning';
    }
  };

  // Chat panel component
  const ChatPanel = () => (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-hidden min-h-0">
        <OptimizedMessageList 
          messages={messages} 
          isLoading={chatLoading} 
          isTyping={isTyping} 
          onAddToIbis={handleAddToIbis} 
          onRetry={retryMessage} 
          deliberationId={deliberationId} 
          agentConfigs={state.agentConfigs} 
        />
      </div>
      <MessageInput onSendMessage={sendMessage} disabled={chatLoading} />
    </div>
  );

  if (isLoading || state.loading) {
    return (
      <Layout>
        <div className="h-[calc(100vh-120px)] flex items-center justify-center">
          <div className="animate-pulse text-center">
            <div className="h-8 bg-muted rounded w-48 mx-auto mb-4"></div>
            <div className="h-4 bg-muted rounded w-32 mx-auto"></div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!user || !state.deliberation) return null;

  if (isAdmin) {
    return (
      <Layout>
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">Admin View</h1>
          <p>Admin interface for deliberation: {state.deliberation.title}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col bg-background rounded-lg border h-[calc(100vh-120px)] min-h-0">
        {/* Header */}
        <div className="border-b bg-card backdrop-blur-sm sticky top-16 z-40">
          {/* Mobile Header */}
          <div className="lg:hidden">
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <h1 className="text-lg font-semibold text-democratic-blue truncate">
                  {state.deliberation.title}
                </h1>
                <Badge className={`${getStatusColor(state.deliberation.status)} text-white text-xs shrink-0`}>
                  {state.deliberation.status}
                </Badge>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => setState(prev => ({ ...prev, isHeaderCollapsed: !prev.isHeaderCollapsed }))}
                className="shrink-0"
              >
                {state.isHeaderCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>

            {!state.isHeaderCollapsed && (
              <div className="px-3 pb-3 space-y-3">
                {/* Description and Notion - Mobile */}
                <div className="space-y-2">
                  {state.deliberation.description && (
                    <div>
                      <p className="text-sm text-muted-foreground line-clamp-2 cursor-pointer" 
                         onClick={() => setState(prev => ({ ...prev, modalContent: 'description', isDescriptionOpen: true }))} 
                         title="Click to view full description">
                        <span className="font-bold text-foreground">Description:</span> {state.deliberation.description}
                      </p>
                    </div>
                  )}
                  
                  {state.deliberation.notion && (
                    <div>
                      <p className="text-sm text-muted-foreground line-clamp-1 cursor-pointer" 
                         onClick={() => setState(prev => ({ ...prev, modalContent: 'notion', isDescriptionOpen: true }))} 
                         title="Click to view full notion statement">
                        <span className="font-bold text-foreground">Notion:</span> {state.deliberation.notion}
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/40 p-2">
                    <ChatModeSelector 
                      mode={state.chatMode} 
                      onModeChange={(mode) => setState(prev => ({ ...prev, chatMode: mode }))} 
                      variant="bare" 
                    />
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-2">
                    <ViewModeSelector 
                      mode={state.viewMode} 
                      onModeChange={(v) => v && setState(prev => ({ ...prev, viewMode: v }))} 
                    />
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <div className="rounded-lg border bg-muted/40 p-2 flex-1">
                    <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                      <VoiceInterfaceLazy 
                        deliberationId={state.deliberation.id} 
                        variant="panel" 
                        sendMessage={sendMessage} 
                      />
                    </Suspense>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 flex flex-col justify-center">
                    <ParticipantScoring {...state.userScores} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Header */}
          <div className="hidden lg:block p-4">
            <div className="flex items-stretch gap-4">
              <div className="flex-1 min-w-0">
                <div className="rounded-lg border bg-muted/40 p-3 h-32 flex flex-col justify-center">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <h1 className="text-lg font-semibold text-democratic-blue truncate">
                        {state.deliberation.title}
                      </h1>
                      <Badge className="bg-blue-500 text-white text-sm shrink-0">
                        {state.deliberation.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                      <Users className="h-4 w-4" />
                      <span>{state.deliberation.participants?.length || state.deliberation.participant_count || 0}</span>
                    </div>
                  </div>
                  
                  {/* Description and Notion - Desktop */}
                  <div className="space-y-1 flex-1 overflow-hidden">
                    {state.deliberation.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 cursor-pointer" 
                         onClick={() => setState(prev => ({ ...prev, modalContent: 'description', isDescriptionOpen: true }))} 
                         title="Click to view full description">
                        <span className="font-bold text-foreground">Description:</span> {state.deliberation.description}
                      </p>
                    )}
                    
                    {state.deliberation.notion && (
                      <p className="text-xs text-muted-foreground line-clamp-1 cursor-pointer" 
                         onClick={() => setState(prev => ({ ...prev, modalContent: 'notion', isDescriptionOpen: true }))} 
                         title="Click to view full notion statement">
                        <span className="font-bold text-foreground">Notion:</span> {state.deliberation.notion}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <div className="rounded-lg border bg-muted/40 px-3 py-2 h-32 flex flex-col justify-center space-y-2">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Text Mode</div>
                    <ChatModeSelector 
                      mode={state.chatMode} 
                      onModeChange={(mode) => setState(prev => ({ ...prev, chatMode: mode }))} 
                      variant="bare" 
                    />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">View Mode</div>
                    <ViewModeSelector 
                      mode={state.viewMode} 
                      onModeChange={(v) => v && setState(prev => ({ ...prev, viewMode: v }))} 
                    />
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <div className="rounded-lg border bg-muted/40 px-3 py-2 h-32 flex flex-col justify-center">
                  <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                    <VoiceInterfaceLazy 
                      deliberationId={state.deliberation.id}
                      variant="panel" 
                      sendMessage={sendMessage} 
                    />
                  </Suspense>
                </div>
              </div>

              <div className="shrink-0">
                <div className="rounded-lg border bg-muted/40 px-3 py-2 h-32 flex flex-col justify-center">
                  <ParticipantScoring {...state.userScores} />
                </div>
              </div>
            </div>
          </div>

          {/* Content Modal */}
          {(state.deliberation.description || state.deliberation.notion) && (
            <Dialog open={state.isDescriptionOpen} onOpenChange={(open) => setState(prev => ({ ...prev, isDescriptionOpen: open }))}>
              <DialogContent className="max-w-none w-screen h-screen p-6 sm:p-10 overflow-hidden">
                <div className="w-full h-full flex items-center justify-center">
                  <article className="max-w-3xl text-center text-foreground whitespace-pre-wrap break-words">
                    {state.modalContent === 'description' ? state.deliberation.description : state.deliberation.notion}
                  </article>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {state.viewMode === 'chat' ? (
            <ChatPanel />
          ) : (
            <Suspense fallback={<div className="flex-1 flex items-center justify-center p-6"><div className="animate-pulse text-muted-foreground">Loading map…</div></div>}>
              <IbisMapVisualizationLazy deliberationId={state.deliberation.id} />
            </Suspense>
          )}
        </div>
        
        {/* IBIS Submission Modal */}
        {state.deliberation && (
          <IbisSubmissionModal 
            isOpen={state.ibisModal.isOpen} 
            onClose={handleIbisModalClose} 
            messageId={state.ibisModal.messageId} 
            messageContent={state.ibisModal.messageContent} 
            deliberationId={state.deliberation.id} 
            onSuccess={handleIbisSuccess} 
          />
        )}
      </div>
    </Layout>
  );
};

export default OptimizedDeliberationChat;