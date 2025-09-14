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

import { useMemoryMonitor } from '@/hooks/useMemoryMonitor';
import { messageProcessingCircuitBreaker } from '@/utils/circuitBreaker';
import { useParticipationSync } from '@/hooks/useParticipationSync';
import { useLoginCounter } from '@/hooks/useLoginCounter';
import { useEnhancedDeliberationLoading } from "@/hooks/useEnhancedDeliberationLoading";

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
  
  const { deliberationId } = useParams<{ deliberationId: string }>();
  const { user, isLoading, isAdmin } = useSupabaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const deliberationService = useOptimizedDeliberationService();
  const { messageService, agentService } = useServices();
  const { stanceService } = useServices();
  const isMobile = useIsMobile();
  
  // Enhanced memory monitoring with realistic thresholds
  const memoryMonitor = useMemoryMonitor('DeliberationChat', {
    threshold: 150, // Increased from 70MB to match actual app usage patterns
    interval: 60000, // Check every 60 seconds to reduce overhead
    enableAutoCleanup: true
  });
  
  // Login counter hook
  const { loginMetrics } = useLoginCounter();
  
  // Enhanced deliberation loading with auto-retry
  const {
    loading: deliberationLoading,
    error: deliberationError,
    deliberation,
    isParticipant,
    agentConfigs,
    retryCount,
    loadDeliberation,
    retryLoad,
    canRetry,
    connectionStatus
  } = useEnhancedDeliberationLoading(deliberationId, {
    maxRetries: 3,
    baseDelay: 1000,
    timeout: 10000,
    autoRecovery: true
  });
  
  // Ref for MessageInput to access setMessage function
  const messageInputRef = useRef<MessageInputRef>(null);

  // PERFORMANCE OPTIMIZATION: Consolidated state with reducer pattern for batch updates
  const [state, setState] = useState({
    // UI State
    ui: {
      chatMode: 'chat' as ChatMode,
      viewMode: 'chat' as ViewMode,
      isDescriptionOpen: false,
      modalContent: 'description' as 'description' | 'notion',
      isHeaderCollapsed: false,
    },
    // Data State
    data: {
      joiningDeliberation: false,
    },
    // User Metrics
    userMetrics: {
      engagement: 0,
      shares: 0,
      sessions: 1,
      stanceScore: 0
    },
    // IBIS Modal
    ibisModal: {
      isOpen: false,
      messageId: '',
      messageContent: ''
    }
  });

  // Memoized selectors to prevent unnecessary re-renders
  const uiState = useMemo(() => state.ui, [state.ui]);
  const dataState = useMemo(() => ({
    ...state.data,
    deliberation,
    isParticipant,
    agentConfigs,
    loading: deliberationLoading,
    error: deliberationError,
  }), [state.data, deliberation, isParticipant, agentConfigs, deliberationLoading, deliberationError]);
  const userMetrics = useMemo(() => state.userMetrics, [state.userMetrics]);
  const ibisModal = useMemo(() => state.ibisModal, [state.ibisModal]);

  // Batch state update helper
  const updateState = useCallback((updates: Partial<typeof state>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Safe nested updaters to prevent stale state clobbering
  // Update data state to only include what's not handled by the enhanced hook
  const updateData = useCallback((dataUpdates: Partial<{joiningDeliberation: boolean}>) => {
    setState(prev => ({ 
      ...prev, 
      data: { ...prev.data, ...dataUpdates }
    }));
  }, []);

  const updateUI = useCallback((uiUpdates: Partial<typeof state.ui>) => {
    setState(prev => ({ 
      ...prev, 
      ui: { ...prev.ui, ...uiUpdates }
    }));
  }, []);

  const updateUserMetrics = useCallback((metricsUpdates: Partial<typeof state.userMetrics>) => {
    setState(prev => ({ 
      ...prev, 
      userMetrics: { ...prev.userMetrics, ...metricsUpdates }
    }));
  }, []);

  const updateIbisModal = useCallback((modalUpdates: Partial<typeof state.ibisModal>) => {
    setState(prev => ({ 
      ...prev, 
      ibisModal: { ...prev.ibisModal, ...modalUpdates }
    }));
  }, []);

  // Use refs for values needed in callbacks - PERFORMANCE: Avoid dependency changes
  const chatModeRef = useRef<ChatMode>('chat');
  
  // Update refs when state changes
  chatModeRef.current = uiState.chatMode;

  // Initialize message queue system - must be called at top level
  const messageQueue = useMessageQueue(3); // max 3 concurrent messages

  // Register cleanup callbacks with memory monitor after messageQueue is available
  useEffect(() => {
    const unregisterCleanup = memoryMonitor.registerCleanup(() => {
      // Clear message queue on memory pressure
      if (messageQueue) {
        messageQueue.clearQueue();
      }
    });
    
    return unregisterCleanup;
  }, [memoryMonitor.registerCleanup, messageQueue]);

  const {
    messages,
    isLoading: chatLoading,
    isTyping,
    sendMessage: originalSendMessage,
    reloadMessages,
    recovery
  } = useOptimizedChat(deliberationId, messageQueue);


  // Filter messages based on view mode and user context
  const filteredMessages = useFilteredMessages(messages, uiState.viewMode, user?.id, isAdmin);

  // Participation sync hook to ensure state consistency - must be called unconditionally
  const { forceSyncParticipation } = useParticipationSync({
    deliberationId: deliberationId || '',
    userId: user?.id || '',
    isParticipant: isParticipant,
    onParticipationUpdate: (newStatus) => {
      // Use debounced callback to prevent loops
      logger.info('Participation status updated via sync', { 
        from: isParticipant, 
        to: newStatus,
        deliberationId 
      });
      // No need to reload - the enhanced hook manages this state internally
    }
  });

  // Use ref to break circular dependency loops for initial loading
  const loadDeliberationRef = useRef(loadDeliberation);
  loadDeliberationRef.current = loadDeliberation;

  // Initial deliberation load with circuit breaker pattern
  useEffect(() => {
    if (!deliberationId || !user) return;

    let mounted = true;
    let loadAttempted = false;
    
    const performInitialLoad = async () => {
      if (loadAttempted) return; // Prevent multiple loads
      loadAttempted = true;
      
      try {
        await loadDeliberationRef.current();
      } catch (error) {
        if (mounted) {
          logger.error('Initial deliberation load failed', error);
        }
      }
    };

    // Small delay to prevent immediate loops
    const timeout = setTimeout(performInitialLoad, 100);
    
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [deliberationId, user]); // Removed loadDeliberation dependency to prevent loops


  // PERFORMANCE OPTIMIZATION: Stable sendMessage with enhanced queue integration and error boundaries
  const sendMessage = useCallback(async (content: string, mode: 'chat' | 'learn' = 'chat') => {
    try {
      if (!content.trim()) {
        return;
      }
      
      if (!messageQueue) {
        logger.error('No message queue available');
        toast({
          title: "Error",
          description: "Message queue not available. Please refresh the page.",
          variant: "destructive"
        });
        return;
      }
      
      const messageId = messageQueue.addToQueue(content, undefined, mode);
      
      updateUserMetrics({ engagement: userMetrics.engagement + 1 });

    } catch (error) {
      logger.error('Failed to add message to queue', error);
      toast({
        title: "Error",
        description: "Failed to queue message. Please try again.",
        variant: "destructive"
      });
    }
  }, [messageQueue, toast, user, deliberationId, updateUserMetrics, stanceService]);

  // setMessageText function for voice interface
  const setMessageText = useCallback((text: string) => {
    if (messageInputRef.current) {
      messageInputRef.current.setMessage(text);
    }
  }, []);

  const retryLoadDeliberation = useCallback(async () => {
    retryLoad();
  }, [retryLoad]);

  // ENHANCED: Comprehensive join handler with state validation and error handling
  const handleJoinDeliberation = useCallback(async () => {
    if (!deliberationId || !user) {
      logger.warn('Join deliberation: Missing required data', { deliberationId, userId: user?.id });
      return;
    }
    
    // Check if already a participant
    if (dataState.isParticipant) {
      logger.info('User already participant, skipping join', { userId: user.id, deliberationId });
      toast({
        title: "Already Joined",
        description: "You are already a participant in this deliberation"
      });
      return;
    }

    // Prevent multiple concurrent join attempts
    if (dataState.joiningDeliberation) {
      logger.warn('Join already in progress, ignoring duplicate request');
      return;
    }
    
    try {
      logger.info('Attempting to join deliberation', { userId: user.id, deliberationId });
      updateData({ joiningDeliberation: true });
      
      await deliberationService.joinDeliberation(deliberationId);
      
      logger.info('Successfully joined deliberation', { userId: user.id, deliberationId });
      
      // Update state optimistically
      updateData({ 
        joiningDeliberation: false 
      });
      
      toast({
        title: "Success",
        description: "You have joined the deliberation successfully"
      });
      
      // Reload to ensure data consistency
      await loadDeliberation();
      
    } catch (error: any) {
      logger.error('Failed to join deliberation', { 
        error: error?.message || error, 
        userId: user.id, 
        deliberationId,
        errorDetails: error 
      });
      
      updateData({ joiningDeliberation: false });
      
      // Enhanced error messaging based on error type
      let errorMessage = "Failed to join deliberation";
      let errorTitle = "Join Failed";
      
      if (error?.message?.includes('already')) {
        errorTitle = "Already Joined";
        errorMessage = "You are already a participant in this deliberation";
        // Server reports already joined; refresh state
        await loadDeliberation();
      } else if (error?.message?.includes('full')) {
        errorMessage = "This deliberation is full and cannot accept more participants";
      } else if (error?.message?.includes('closed') || error?.message?.includes('concluded')) {
        errorMessage = "This deliberation is no longer accepting new participants";
      } else if (error?.message?.includes('permission')) {
        errorMessage = "You do not have permission to join this deliberation";
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: errorTitle === "Already Joined" ? "default" : "destructive"
      });
    }
  }, [deliberationId, user, deliberationService, toast, loadDeliberation, dataState.isParticipant, dataState.joiningDeliberation]);

  // PERFORMANCE OPTIMIZATION: Stable IBIS handlers with minimal state updates
  const handleAddToIbis = useCallback((messageId: string, messageContent: string) => {
    updateIbisModal({ isOpen: true, messageId, messageContent });
  }, []);

  const handleIbisModalClose = useCallback(() => {
    updateIbisModal({ isOpen: false, messageId: '', messageContent: '' });
  }, []);

  const handleIbisSuccess = useCallback(() => {
    reloadMessages();
    loadDeliberation();
  }, [reloadMessages, loadDeliberation]);

  // Enhanced queue status integration with debugging and recovery - stabilized
  const queueStatusProps = useMemo(() => {
    const props = {
      queuedMessages: messageQueue.queue,
      processingCount: messageQueue.processing.size,
      onRetryMessage: messageQueue.retryMessage,
      onRemoveMessage: messageQueue.removeFromQueue,
      messageQueue: messageQueue, // Pass full queue for debug panel
      recovery: recovery, // Pass recovery system
      onRefreshMessages: reloadMessages // Pass refresh function
    };
    
    return props;
  }, [
    messageQueue.queue.length, 
    messageQueue.processing.size, 
    messageQueue.retryMessage,
    messageQueue.removeFromQueue,
    recovery, 
    reloadMessages
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

  // Mobile view mode optimization - only allow chat mode on mobile
  useEffect(() => {
    if (isMobile && uiState.viewMode !== 'chat') {
      updateUI({ viewMode: 'chat' });
    }
  }, [isMobile, uiState.viewMode]); // Minimal dependencies

  // Update user metrics when login metrics change
  useEffect(() => {
    if (loginMetrics) {
      updateUserMetrics({ sessions: loginMetrics.totalLogins || 0 });
    }
  }, [loginMetrics?.totalLogins]);

  // Enhanced watchdog for stuck loading states with auto-recovery
  useEffect(() => {
    if (deliberationLoading && !deliberationError) {
      const watchdog = setTimeout(() => {
        logger.warn('Loading watchdog triggered - attempting auto-recovery');
        // Try to force reconnection first
        if (window.navigator.onLine) {
          logger.info('Network is online, attempting fresh load');
          retryLoad();
        } else {
          toast({
            title: "Connection Error", 
            description: 'No network connection detected. Please check your internet and try again.',
            variant: "destructive"
          });
        }
      }, 8000); // 8 second timeout for faster recovery

      return () => clearTimeout(watchdog);
    }
  }, [deliberationLoading, deliberationError, retryLoad, toast]);

  // PERFORMANCE OPTIMIZATION: Memoized status color to prevent recalculation
  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'active': return 'bg-success';
      case 'concluded': return 'bg-muted-foreground';
      case 'draft': return 'bg-warning';
      default: return 'bg-muted-foreground';
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

  // Render loading state - improved logic to prevent blank screens
  if (isLoading || !user) {
    return (
      <div className="h-[calc(100vh-120px)] flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="h-8 bg-muted rounded w-48 mx-auto mb-4"></div>
          <div className="h-4 bg-muted rounded w-32 mx-auto"></div>
        </div>
      </div>
    );
  }

  // Enhanced error state with diagnostic information
  if (dataState.error && !dataState.loading) {
    return (
      <div className="h-[calc(100vh-120px)] flex items-center justify-center">
        <div className="text-center space-y-4 p-6 rounded-lg border bg-card max-w-lg">
          <div className="text-destructive text-lg font-medium">Error Loading Deliberation</div>
          <div className="text-sm text-muted-foreground">{dataState.error}</div>
          
          {/* Diagnostic Information */}
          <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded space-y-1">
            <div>Connection: {connectionStatus}</div>
            <div>Retry Count: {retryCount}</div>
            <div>Online: {navigator.onLine ? 'Yes' : 'No'}</div>
            <div>Memory: {memoryMonitor.getMemoryStats().usedJSMemory}MB</div>
          </div>
          
          <div className="space-y-2">
            <Button 
              onClick={retryLoadDeliberation} 
              variant="outline"
              disabled={!canRetry}
              className="w-full"
            >
              {!canRetry ? 'Retrying...' : 'Try Again'}
            </Button>
            <Button 
              onClick={() => window.location.reload()} 
              variant="ghost" 
              size="sm"
              className="text-xs"
            >
              Refresh Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading while deliberation data loads
  if (dataState.loading || !dataState.deliberation) {
    return (
      <div className="h-[calc(100vh-120px)] flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="h-8 bg-muted rounded w-48 mx-auto mb-4"></div>
          <div className="h-4 bg-muted rounded w-32 mx-auto mb-2"></div>
          <div className="text-sm text-muted-foreground">Loading deliberation...</div>
        </div>
      </div>
    );
  }

  // Show join screen if user is not a participant
  if (!dataState.isParticipant && !isAdmin) {
    return (
      <div className="h-[calc(100vh-120px)] flex items-center justify-center bg-background">
        <div className="max-w-2xl mx-auto p-6 text-center space-y-6">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-foreground">
              {dataState.deliberation.title}
            </h1>
            <Badge className={`${getStatusColor(dataState.deliberation.status)} text-white text-sm`}>
              {dataState.deliberation.status}
            </Badge>
          </div>
          
          {dataState.deliberation.description && (
            <div className="bg-card border rounded-lg p-4 text-left">
              <h3 className="font-semibold text-primary mb-2">Description</h3>
              <p className="text-card-foreground text-sm">
                {dataState.deliberation.description}
              </p>
            </div>
          )}
          
          {dataState.deliberation.notion && (
            <div className="bg-card border rounded-lg p-4 text-left">
              <h3 className="font-semibold text-primary mb-2">Notion Statement</h3>
              <p className="text-card-foreground text-sm">
                {dataState.deliberation.notion}
              </p>
            </div>
          )}
          
          <div className="bg-muted/30 border rounded-lg p-4">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-2">
              <Users className="h-4 w-4" />
              <span>{dataState.deliberation.participant_count || 0} participants</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Created {new Date(dataState.deliberation.created_at).toLocaleDateString()}
            </div>
          </div>
          
          <div className="space-y-3">
            <Button 
              onClick={handleJoinDeliberation}
              disabled={dataState.joiningDeliberation}
              className="bg-democratic-blue hover:bg-democratic-blue/90 text-white px-8 py-3 text-lg"
              size="lg"
            >
              {dataState.joiningDeliberation ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Joining...
                </>
              ) : (
                "Join Deliberation"
              )}
            </Button>
            
            <p className="text-xs text-muted-foreground">
              You need to join this deliberation to participate in the discussion
            </p>
          </div>
        </div>
      </div>
    );
  }

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
                 <div className="flex items-center gap-1 text-xs text-foreground bg-muted/50 px-2 py-1 rounded border">
                   <Users className="h-3 w-3" />
                   <span className="font-medium">{dataState.deliberation.participant_count || 0}</span>
                 </div>
                 <MessageQueueStatus {...queueStatusProps} />
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => updateUI({ isHeaderCollapsed: !uiState.isHeaderCollapsed })}
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
                             onClick={() => updateUI({ modalContent: 'description', isDescriptionOpen: true })}
                           title="Click to view full description">
                           <p className="text-sm text-card-foreground">
                             <span className="font-semibold text-primary group-hover:text-accent-foreground">Description:</span> 
                            <span className="ml-1 group-hover:text-accent-foreground">{dataState.deliberation.description?.length > 90 ? `${dataState.deliberation.description.slice(0, 90)}...` : dataState.deliberation.description}</span>
                           </p>
                         </button>
                       </div>
                     )}
                    
                     {dataState.deliberation.notion && (
                       <div>
                         <button 
                           className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-primary/50" 
                             onClick={() => updateUI({ modalContent: 'notion', isDescriptionOpen: true })}
                           title="Click to view full notion statement">
                           <p className="text-sm text-card-foreground">
                             <span className="font-semibold text-primary group-hover:text-accent-foreground">Notion:</span> 
                            <span className="ml-1 group-hover:text-accent-foreground">{dataState.deliberation.notion?.length > 90 ? `${dataState.deliberation.notion.slice(0, 90)}...` : dataState.deliberation.notion}</span>
                           </p>
                         </button>
                       </div>
                     )}
                  </div>
                  
                  <div className="rounded-lg border bg-muted/40 p-2 flex flex-col gap-3 justify-center">
                    <ChatModeSelector 
                      mode={uiState.chatMode} 
                       onModeChange={(mode) => updateUI({ chatMode: mode })}
                      variant="bare" 
                    />
                    <ViewModeSelector 
                      mode={uiState.viewMode} 
                       onModeChange={(v) => v && updateUI({ viewMode: v })}
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
                      <h1 className="text-xl font-semibold text-foreground truncate">
                        {dataState.deliberation.title}
                      </h1>
                       <Badge className={`${getStatusColor(dataState.deliberation.status)} text-white w-fit text-sm`}>
                         {dataState.deliberation.status}
                       </Badge>
                    </div>
                     <div className="flex items-center gap-2">
                       <div className="flex items-center gap-2 text-sm text-foreground bg-muted/50 px-2 py-1 rounded border">
                         <Users className="h-4 w-4" />
                         <span className="font-medium">{dataState.deliberation.participant_count || 0} participants</span>
                       </div>
                       <MessageQueueStatus {...queueStatusProps} />
                       <Button
                        variant="default"
                        size="sm"
                          onClick={() => updateUI({ isHeaderCollapsed: !uiState.isHeaderCollapsed })}
                      >
                        {uiState.isHeaderCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  
                  {!uiState.isHeaderCollapsed && (
                    <>
                      {(dataState.deliberation.description || dataState.deliberation.notion) && (
                        <div className="flex gap-2">
                          {dataState.deliberation.description && (
                            <button 
                              className="flex-1 text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-primary/50" 
                                onClick={() => updateUI({ modalContent: 'description', isDescriptionOpen: true })}
                              title="Click to view full description">
                                <p className="text-sm text-card-foreground">
                                  <span className="font-medium text-primary group-hover:text-accent-foreground">Description:</span> 
                                  <span className="ml-1 group-hover:text-accent-foreground">{(dataState.deliberation.description?.length ?? 0) > 200 ? `${dataState.deliberation.description?.slice(0, 200)}...` : dataState.deliberation.description}</span>
                                </p>
                            </button>
                          )}
                          {dataState.deliberation.notion && (
                            <button 
                              className="flex-1 text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-primary/50" 
                                onClick={() => updateUI({ modalContent: 'notion', isDescriptionOpen: true })}
                              title="Click to view full notion statement">
                                <p className="text-sm text-card-foreground">
                                  <span className="font-medium text-primary group-hover:text-accent-foreground">Notion:</span> 
                                  <span className="ml-1 group-hover:text-accent-foreground">{(dataState.deliberation.notion?.length ?? 0) > 200 ? `${dataState.deliberation.notion?.slice(0, 200)}...` : dataState.deliberation.notion}</span>
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
                  <div className="rounded-lg border bg-muted/40 p-2 flex flex-col gap-3 justify-center flex-1">
                    <ChatModeSelector 
                      mode={uiState.chatMode} 
                       onModeChange={(mode) => updateUI({ chatMode: mode })}
                      variant="bare" 
                    />
                    <ViewModeSelector 
                      mode={uiState.viewMode} 
                       onModeChange={(v) => v && updateUI({ viewMode: v })}
                    />
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-2 flex-1">
                     <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                       <VoiceInterfaceLazy 
                         deliberationId={dataState.deliberation?.id || ''} 
                         variant="panel" 
                         sendMessage={sendMessage}
                         setMessageText={setMessageText}
                       />
                     </Suspense>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 flex flex-col justify-center flex-1">
                    <ParticipantScoring {...userMetrics} />
                  </div>
                  
                </div>
              )}
            </div>

            {/* Description Modal */}
            {uiState.isDescriptionOpen && (
               <Dialog open={uiState.isDescriptionOpen} onOpenChange={() => updateUI({ isDescriptionOpen: false })}>
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


          <div className="flex-1 flex flex-col min-h-0">
            {uiState.viewMode === 'chat' ? (
              <ChatPanel />
            ) : uiState.viewMode === 'ibis' ? (
               <Suspense fallback={<div className="flex-1 flex items-center justify-center p-6"><div className="animate-pulse text-muted-foreground">Loading map…</div></div>}>
                 <IbisMapVisualizationLazy deliberationId={dataState.deliberation?.id || ''} />
               </Suspense>
             ) : (
               <Suspense fallback={<div className="flex-1 flex items-center justify-center p-6"><div className="animate-pulse text-muted-foreground">Loading table…</div></div>}>
                 <IbisTableViewLazy deliberationId={dataState.deliberation?.id || ''} />
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
               deliberationId={dataState.deliberation?.id || ''} 
               onSuccess={handleIbisSuccess} 
             />
          )}
        </div>
      )}
      
    </>
  );
};

export default OptimizedDeliberationChat;