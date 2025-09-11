import { useEffect, useState, lazy, Suspense, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { IbisSubmissionModal } from "@/components/chat/IbisSubmissionModal";
import { MessageInput, MessageInputRef } from "@/components/chat/MessageInput";
import { ChatModeSelector, ChatMode } from "@/components/chat/ChatModeSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ViewModeSelector, ViewMode } from "@/components/chat/ViewModeSelector";
import { useFilteredMessages } from "@/hooks/useFilteredMessages";
import { Users, ChevronDown, ChevronUp } from "lucide-react";
import { useRenderPerformanceTracker } from "@/utils/renderPerformanceMonitor";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ParticipantScoring } from "@/components/chat/ParticipantScoring";
import { useIsMobile } from "@/hooks/use-mobile";
import { OptimizedMessageList } from "@/components/chat/OptimizedMessageList";
import { MessageQueueStatus } from "@/components/chat/MessageQueueStatus";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useOptimizedDeliberationService } from "@/hooks/useOptimizedDeliberationService";
import { useServices } from "@/hooks/useServices";
import { useOptimizedChat } from "@/hooks/useOptimizedChat";
import { useMessageQueue } from "@/hooks/useMessageQueue";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { supabase } from "@/integrations/supabase/client";

const IbisMapVisualizationLazy = lazy(() => import("@/components/ibis/IbisMapVisualization").then(m => ({
  default: m.IbisMapVisualization
})));

const IbisTableViewLazy = lazy(() => import("@/components/ibis/IbisTableView").then(m => ({
  default: m.IbisTableView
})));

const VoiceInterfaceLazy = lazy(() => import("@/components/chat/VoiceInterface"));
import { AdminDeliberationView } from "@/components/admin/AdminDeliberationView";

interface Deliberation {
  id: string;
  title: string;
  description?: string;
  notion?: string;
  status: 'draft' | 'active' | 'concluded';
  facilitator_id?: string;
  is_public: boolean;
  max_participants: number;
  participants?: any[];
  participant_count?: number;
  created_at?: string;
}

const OptimizedDeliberationChat = () => {
  // Performance tracking
  useRenderPerformanceTracker('DeliberationChat');
  
  const { deliberationId } = useParams<{ deliberationId: string }>();
  const { user, isLoading, isAdmin } = useSupabaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const deliberationService = useOptimizedDeliberationService();
  const { messageService, agentService } = useServices();
  const isMobile = useIsMobile();
  
  // Ref for MessageInput to access setMessage function
  const messageInputRef = useRef<MessageInputRef>(null);

  // PERFORMANCE OPTIMIZATION: Split state into UI and data concerns to reduce re-render scope
  const [uiState, setUiState] = useState({
    chatMode: 'chat' as ChatMode,
    viewMode: 'chat' as ViewMode,
    isDescriptionOpen: false,
    modalContent: 'description' as 'description' | 'notion',
    isHeaderCollapsed: false,
  });

  const [dataState, setDataState] = useState({
    loading: true,
    deliberation: null as Deliberation | null,
    isParticipant: false,
    agentConfigs: [] as Array<{agent_type: string; name: string; description?: string;}>,
  });

  const [userMetrics, setUserMetrics] = useState({
    engagement: 0,
    shares: 0,
    sessions: 1,
    stanceScore: 0
  });

  const [ibisModal, setIbisModal] = useState({
    isOpen: false,
    messageId: '',
    messageContent: ''
  });

  // Use refs for values needed in callbacks - PERFORMANCE: Avoid dependency changes
  const chatModeRef = useRef<ChatMode>('chat');
  const deliberationRef = useRef<Deliberation | null>(null);
  
  // Update refs when state changes
  chatModeRef.current = uiState.chatMode;
  deliberationRef.current = dataState.deliberation;

  // Initialize message queue system
  const messageQueue = useMessageQueue(3); // max 3 concurrent messages
  
  // DEBUG: Add logging to verify queue initialization
  useEffect(() => {
    console.log('🔧 [DEBUG] Message queue initialized:', {
      hasQueue: !!messageQueue,
      queueStats: messageQueue?.getQueueStats,
      deliberationId,
      timestamp: new Date().toISOString()
    });
  }, [messageQueue, deliberationId]);

  const {
    messages,
    isLoading: chatLoading,
    isTyping,
    sendMessage: originalSendMessage,
    reloadMessages,
    recovery,
    realtimeConnection,
    forceReconnect
  } = useOptimizedChat(deliberationId, messageQueue);

  // Filter messages based on view mode and user context
  const filteredMessages = useFilteredMessages(messages, uiState.viewMode, user?.id, isAdmin);


  // PERFORMANCE OPTIMIZATION: Stable sendMessage with enhanced queue integration
  const sendMessage = useCallback(async (content: string, mode: 'chat' | 'learn' = 'chat') => {
    console.log('🚀 [DEBUG] sendMessageWithQueue called', { 
      content: content.substring(0, 50) + '...', 
      mode, 
      hasQueue: !!messageQueue,
      queueStats: messageQueue?.getQueueStats
    });
    
    if (!content.trim()) {
      console.warn('⚠️ [DEBUG] Empty message content, aborting');
      return;
    }
    
    // Enhanced logging to track mode parameter flow
    logger.info('sendMessage called with mode parameter', { 
      mode,
      isLearnMode: mode === 'learn',
      contentLength: content.length,
      chatModeFromUI: uiState.chatMode
    });
    
    // Add to queue with proper error handling
    try {
      if (!messageQueue) {
        console.error('❌ [DEBUG] No message queue available!');
        toast({
          title: "Error",
          description: "Message queue not available. Please refresh the page.",
          variant: "destructive"
        });
        return;
      }
      
      const messageId = messageQueue.addToQueue(content, undefined, mode);
      console.log('✅ [DEBUG] Message added to queue successfully', { 
        messageId: messageId.substring(0, 8),
        mode,
        content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
        newStats: messageQueue.getQueueStats
      });
      
      logger.info('Message added to queue successfully', { 
        messageId: messageId.substring(0, 8),
        mode,
        content: content.substring(0, 50) + (content.length > 50 ? '...' : '')
      });
      
      setUserMetrics(prev => ({
        ...prev,
        engagement: prev.engagement + 1
      }));
    } catch (error) {
      console.error('❌ [DEBUG] Failed to add message to queue', error);
      logger.error('Failed to add message to queue', error as Error);
      toast({
        title: "Error",
        description: "Failed to queue message. Please try again.",
        variant: "destructive"
      });
    }
  }, [messageQueue, toast, uiState.chatMode, logger]); // Enhanced dependencies for proper error handling

  // setMessageText function for voice interface
  const setMessageText = useCallback((text: string) => {
    if (messageInputRef.current) {
      messageInputRef.current.setMessage(text);
    }
  }, []);

  // PERFORMANCE OPTIMIZATION: Stable loadDeliberation with minimal state updates
  const loadDeliberation = useCallback(async () => {
    if (!deliberationId || !user) return;

    try {
      setDataState(prev => ({ ...prev, loading: true }));
      
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

      // PERFORMANCE: Batch state updates to reduce re-renders
      setDataState(prev => ({
        ...prev,
        deliberation: deliberationData,
        isParticipant: isUserParticipant,
        agentConfigs: mappedConfigs,
        loading: false
      }));

      // Load user scores separately - skip for admins since they see all messages
      if (user.id && !isAdmin) {
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

          setUserMetrics({
            engagement: deliberationMessages.length,
            shares: ibisSubmissions.length,
            sessions: 1,
            stanceScore: stanceData?.stance_score || 0
          });
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
      setDataState(prev => ({ ...prev, loading: false }));
    }
  }, [deliberationId, user, deliberationService, agentService, messageService, toast, isAdmin]); // Stable dependencies

  // PERFORMANCE OPTIMIZATION: Stable join handler
  const handleJoinDeliberation = useCallback(async () => {
    if (!deliberationId || !user) return;
    
    try {
      await deliberationService.joinDeliberation(deliberationId);
      setDataState(prev => ({ ...prev, isParticipant: true }));
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

  // PERFORMANCE OPTIMIZATION: Stable IBIS handlers with minimal state updates
  const handleAddToIbis = useCallback((messageId: string, messageContent: string) => {
    setIbisModal({ isOpen: true, messageId, messageContent });
  }, []);

  const handleIbisModalClose = useCallback(() => {
    setIbisModal({ isOpen: false, messageId: '', messageContent: '' });
  }, []);

  const handleIbisSuccess = useCallback(() => {
    reloadMessages();
    loadDeliberation();
  }, [reloadMessages, loadDeliberation]);

  // Enhanced queue status integration with debugging and recovery - stabilized
  const queueStatusProps = useMemo(() => {
    // Stabilize realtime connection to prevent rapid re-renders
    const stableRealtimeConnection = realtimeConnection ? {
      isConnected: realtimeConnection.isConnected,
      status: realtimeConnection.status,
      connectionError: realtimeConnection.connectionError
    } : null;

    const props = {
      queuedMessages: messageQueue.queue,
      processingCount: messageQueue.processing.size,
      onRetryMessage: messageQueue.retryMessage,
      onRemoveMessage: messageQueue.removeFromQueue,
      messageQueue: messageQueue, // Pass full queue for debug panel
      recovery: recovery, // Pass recovery system
      realtimeConnection: stableRealtimeConnection, // Use stabilized connection
      onRefreshMessages: reloadMessages, // Pass refresh function
      onForceReconnect: forceReconnect // Pass force reconnect function
    };
    
    return props;
  }, [
    messageQueue.queue.length, 
    messageQueue.processing.size, 
    messageQueue.retryMessage,
    messageQueue.removeFromQueue,
    recovery, 
    realtimeConnection?.isConnected, // Only key properties, not the whole object
    realtimeConnection?.status,
    realtimeConnection?.connectionError,
    reloadMessages, 
    forceReconnect
  ]);

  // Enhanced queue processor monitoring
  useEffect(() => {
    const stats = messageQueue.getQueueStats;
    
    logger.info('Queue state changed', {
      stats,
      timestamp: new Date().toISOString()
    });
    
    // Alert if queue is stuck
    if (stats.processing > 0 && stats.queued > 0 && !stats.canProcess) {
      logger.warn('Queue appears to be at capacity', {
        stats,
        timestamp: new Date().toISOString()
      });
    }
    
  }, [messageQueue.queue.length, messageQueue.processing.size]);
  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
      return;
    }
    if (user && deliberationId) {
      loadDeliberation();
    }
  }, [user?.id, isLoading, deliberationId, navigate, loadDeliberation]); // Only depend on user.id to prevent unnecessary calls

  // Mobile view mode optimization - only allow chat mode on mobile
  useEffect(() => {
    if (isMobile && uiState.viewMode !== 'chat') {
      setUiState(prev => ({ ...prev, viewMode: 'chat' }));
    }
  }, [isMobile, uiState.viewMode]); // Minimal dependencies

  // PERFORMANCE OPTIMIZATION: Memoized status color to prevent recalculation
  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'active': return 'bg-success';
      case 'completed': return 'bg-muted-foreground';
      default: return 'bg-warning';
    }
  }, []);

  // PERFORMANCE OPTIMIZATION: Stable ChatPanel with minimal dependencies
  const ChatPanel = useCallback(() => (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-hidden min-h-0">
        <OptimizedMessageList 
          messages={filteredMessages} 
          isLoading={chatLoading} 
          isTyping={isTyping} 
          onAddToIbis={handleAddToIbis} 
          deliberationId={deliberationId || ''} 
          agentConfigs={dataState.agentConfigs} 
        />
      </div>
      <MessageInput 
        ref={messageInputRef} 
        onSendMessage={sendMessage} 
        disabled={chatLoading} 
        mode={uiState.chatMode}
        deliberationId={deliberationId}
      />
    </div>
  ), [
    filteredMessages, 
    chatLoading, 
    isTyping, 
    handleAddToIbis, 
    deliberationId, 
    dataState.agentConfigs, 
    sendMessage,
    uiState.chatMode
  ]);

  // Render loading state
  if (isLoading || dataState.loading) {
    return (
      <div className="h-[calc(100vh-120px)] flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="h-8 bg-muted rounded w-48 mx-auto mb-4"></div>
          <div className="h-4 bg-muted rounded w-32 mx-auto"></div>
        </div>
      </div>
    );
  }

  // Early return for missing data
  if (!user || !dataState.deliberation) return null;

  // CRITICAL FIX: Move admin check to JSX render instead of early return
  // This prevents hooks inconsistency errors
  return (
    <>
      {isAdmin ? (
        <AdminDeliberationView />
      ) : (
        <div className="flex flex-col bg-background rounded-lg border h-[calc(100vh-120px)] min-h-0">
          {/* Controls Panel */}
          <div className="border-b bg-card p-3">
            {/* Mobile Controls */}
            <div className="lg:hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <h1 className="text-lg font-semibold text-foreground truncate">
                    {dataState.deliberation.title}
                  </h1>
                   <Badge className={`${getStatusColor(dataState.deliberation.status)} text-white text-xs w-fit`}>
                     {dataState.deliberation.status}
                   </Badge>
                </div>
                <div className="flex items-center gap-2">
                 <MessageQueueStatus {...queueStatusProps} />
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setUiState(prev => ({ ...prev, isHeaderCollapsed: !prev.isHeaderCollapsed }))}
                  >
                    {uiState.isHeaderCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {!uiState.isHeaderCollapsed && (
                <div className="space-y-3">
                  {/* Description and Notion - Mobile */}
                  <div className="space-y-2">
                     {dataState.deliberation.description && (
                       <div>
                         <button 
                           className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-primary/50" 
                           onClick={() => setUiState(prev => ({ ...prev, modalContent: 'description', isDescriptionOpen: true }))} 
                           title="Click to view full description">
                           <p className="text-sm text-card-foreground">
                             <span className="font-semibold text-primary group-hover:text-accent-foreground">Description:</span> 
                            <span className="ml-1 group-hover:text-accent-foreground">{dataState.deliberation.description.length > 100 ? `${dataState.deliberation.description.slice(0, 100)}...` : dataState.deliberation.description}</span>
                           </p>
                         </button>
                       </div>
                     )}
                    
                     {dataState.deliberation.notion && (
                       <div>
                         <button 
                           className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-primary/50" 
                           onClick={() => setUiState(prev => ({ ...prev, modalContent: 'notion', isDescriptionOpen: true }))} 
                           title="Click to view full notion statement">
                           <p className="text-sm text-card-foreground">
                             <span className="font-semibold text-primary group-hover:text-accent-foreground">Notion:</span> 
                            <span className="ml-1 group-hover:text-accent-foreground">{dataState.deliberation.notion.length > 100 ? `${dataState.deliberation.notion.slice(0, 100)}...` : dataState.deliberation.notion}</span>
                           </p>
                         </button>
                       </div>
                     )}
                  </div>
                  
                  <div className="rounded-lg border bg-muted/40 p-2 flex flex-col gap-3 justify-center">
                    <ChatModeSelector 
                      mode={uiState.chatMode} 
                      onModeChange={(mode) => setUiState(prev => ({ ...prev, chatMode: mode }))} 
                      variant="bare" 
                    />
                    <ViewModeSelector 
                      mode={uiState.viewMode} 
                      onModeChange={(v) => v && setUiState(prev => ({ ...prev, viewMode: v }))} 
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="rounded-lg border bg-muted/40 p-2 flex-1">
                      <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                        <VoiceInterfaceLazy 
                          deliberationId={dataState.deliberation.id} 
                          variant="panel" 
                          sendMessage={sendMessage}
                          setMessageText={setMessageText}
                        />
                      </Suspense>
                    </div>
                    <div className="rounded-lg border bg-muted/40 px-3 py-2 flex flex-col justify-center">
                      <ParticipantScoring {...userMetrics} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Controls */}
            <div className="hidden lg:block">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <h1 className="text-2xl font-bold text-foreground truncate">
                        {dataState.deliberation.title}
                      </h1>
                       <Badge className={`${getStatusColor(dataState.deliberation.status)} text-white w-fit`}>
                         {dataState.deliberation.status}
                       </Badge>
                    </div>
                     <div className="flex items-center gap-2">
                       <MessageQueueStatus {...queueStatusProps} />
                       <Button
                        variant="default"
                        size="sm"
                        onClick={() => setUiState(prev => ({ ...prev, isHeaderCollapsed: !prev.isHeaderCollapsed }))}
                      >
                        {uiState.isHeaderCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  
                  {!uiState.isHeaderCollapsed && (
                    <>
                      {(dataState.deliberation.description || dataState.deliberation.notion) && (
                        <div className="space-y-2">
                          {dataState.deliberation.description && (
                            <button 
                              className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-primary/50" 
                              onClick={() => setUiState(prev => ({ ...prev, modalContent: 'description', isDescriptionOpen: true }))} 
                              title="Click to view full description">
                              <p className="text-sm text-card-foreground">
                                <span className="font-semibold text-primary group-hover:text-accent-foreground">Description:</span> 
                                <span className="ml-1 group-hover:text-accent-foreground">{dataState.deliberation.description.length > 200 ? `${dataState.deliberation.description.slice(0, 200)}...` : dataState.deliberation.description}</span>
                              </p>
                            </button>
                          )}
                          {dataState.deliberation.notion && (
                            <button 
                              className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-primary/50" 
                              onClick={() => setUiState(prev => ({ ...prev, modalContent: 'notion', isDescriptionOpen: true }))} 
                              title="Click to view full notion statement">
                              <p className="text-sm text-card-foreground">
                                <span className="font-semibold text-primary group-hover:text-accent-foreground">Notion:</span> 
                                <span className="ml-1 group-hover:text-accent-foreground">{dataState.deliberation.notion.length > 200 ? `${dataState.deliberation.notion.slice(0, 200)}...` : dataState.deliberation.notion}</span>
                              </p>
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {!uiState.isHeaderCollapsed && (
                <div className="flex flex-wrap gap-3">
                  <div className="rounded-lg border bg-muted/40 p-2 flex flex-col gap-3 justify-center">
                    <ChatModeSelector 
                      mode={uiState.chatMode} 
                      onModeChange={(mode) => setUiState(prev => ({ ...prev, chatMode: mode }))} 
                      variant="bare" 
                    />
                    <ViewModeSelector 
                      mode={uiState.viewMode} 
                      onModeChange={(v) => v && setUiState(prev => ({ ...prev, viewMode: v }))} 
                    />
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-2 flex-1">
                    <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                      <VoiceInterfaceLazy 
                        deliberationId={dataState.deliberation.id} 
                        variant="panel" 
                        sendMessage={sendMessage}
                        setMessageText={setMessageText}
                      />
                    </Suspense>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 flex flex-col justify-center">
                    <ParticipantScoring {...userMetrics} />
                  </div>
                </div>
              )}
            </div>
            
            {/* Participant Count */}
            <div className="bg-muted/30 border-t border-border/50">
              <div className="px-4 py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{dataState.deliberation.participant_count || 0} participants</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Created {new Date(dataState.deliberation.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Description Modal */}
            {uiState.isDescriptionOpen && (
              <Dialog open={uiState.isDescriptionOpen} onOpenChange={() => setUiState(prev => ({ ...prev, isDescriptionOpen: false }))}>
                <DialogContent className="max-w-2xl">
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold">
                      {uiState.modalContent === 'description' ? 'Description' : 'Notion Statement'}
                    </h2>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {uiState.modalContent === 'description' 
                        ? dataState.deliberation.description 
                        : dataState.deliberation.notion
                      }
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
          
          {/* Main Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {uiState.viewMode === 'chat' ? (
              <ChatPanel />
            ) : uiState.viewMode === 'ibis' ? (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center p-6"><div className="animate-pulse text-muted-foreground">Loading map…</div></div>}>
                <IbisMapVisualizationLazy deliberationId={dataState.deliberation.id} />
              </Suspense>
            ) : (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center p-6"><div className="animate-pulse text-muted-foreground">Loading table…</div></div>}>
                <IbisTableViewLazy deliberationId={dataState.deliberation.id} />
              </Suspense>
            )}
          </div>
          
          {/* IBIS Submission Modal */}
          {dataState.deliberation && (
            <IbisSubmissionModal 
              isOpen={ibisModal.isOpen} 
              onClose={handleIbisModalClose} 
              messageId={ibisModal.messageId} 
              messageContent={ibisModal.messageContent} 
              deliberationId={dataState.deliberation.id} 
              onSuccess={handleIbisSuccess} 
            />
          )}
        </div>
      )}
    </>
  );
};

export default OptimizedDeliberationChat;