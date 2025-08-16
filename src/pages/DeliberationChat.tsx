import { useEffect, useState, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDeliberationService } from "@/hooks/useDeliberationService";
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
import { Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ParticipantScoring } from "@/components/chat/ParticipantScoring";
import { useIsMobile } from "@/hooks/use-mobile";
const VoiceInterfaceLazy = lazy(() => import("@/components/chat/VoiceInterface"));
import { logger } from "@/utils/logger";
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
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
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

  // Scoring state - these would be tracked from actual user activity
  const [userScores, setUserScores] = useState({
    engagement: 0,
    // Count of messages sent in current session
    shares: 0,
    // Count of IBIS submissions
    sessions: 1 // Count of login sessions (4+ hours apart)
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
    }
  }, [user, isLoading, deliberationId, navigate]);
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
        <MessageList messages={messages} isLoading={chatLoading} isTyping={isTyping} onAddToIbis={handleAddToIbis} onRetry={retryMessage} deliberationId={deliberationId} />
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
        <div className="border-b p-4 bg-card backdrop-blur-sm" style={{
        position: 'sticky',
        top: '64px',
        zIndex: 40,
        backgroundColor: 'hsl(var(--card) / 0.95)'
      }}>
          <div className="flex flex-col gap-3">
            {/* Title moved into left box below */}

            {/* Sub-header with three boxes */}
            <div className="flex items-stretch justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="rounded-lg border bg-muted/40 p-3 h-full">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <h1 className="text-xl font-semibold text-democratic-blue truncate">{deliberation.title}</h1>
                        <Badge className={`${getStatusColor(deliberation.status)} text-white`}>{deliberation.status}</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                        <Users className="h-4 w-4" />
                        <span>{deliberation.participants?.length || deliberation.participant_count || 0}/{deliberation.max_participants}</span>
                      </div>
                    </div>
                  {deliberation.description && <>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-6 cursor-pointer" onClick={() => setIsDescriptionOpen(true)} title="Click to view full description">
                        {deliberation.description}
                      </p>
                      <Dialog open={isDescriptionOpen} onOpenChange={setIsDescriptionOpen}>
                        <DialogContent className="max-w-none w-screen h-screen p-6 sm:p-10 overflow-hidden">
                          <div className="w-full h-full flex items-center justify-center">
                            <article className="max-w-3xl text-center text-foreground whitespace-pre-wrap break-words">
                              {deliberation.description}
                            </article>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>}
                    <div className="mt-1">
                      {!isParticipant}
                    </div>
                </div>
              </div>

              <div className="p-3">
                <div className="flex items-stretch gap-3 flex-wrap">
                  <div className="flex flex-col gap-3 h-full">
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Text Mode</div>
                      <ChatModeSelector mode={chatMode} onModeChange={setChatMode} variant="bare" />
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-3 flex-1">
                      <div className="text-xs font-medium text-muted-foreground mb-2">View Mode</div>
                      <ViewModeSelector mode={viewMode} onModeChange={v => v && setViewMode(v)} />
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3 h-full">
                    <Suspense fallback={<div className="text-xs text-muted-foreground">Loading voice…</div>}>
                      <VoiceInterfaceLazy deliberationId={deliberation.id} variant="panel" />
                    </Suspense>
                  </div>
                </div>
              </div>

              <div className="p-3">
                <ParticipantScoring engagement={userScores.engagement} shares={userScores.shares} sessions={userScores.sessions} target={10} />
              </div>
            </div>
          </div>
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