import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { useDeliberationService } from "@/hooks/useDeliberationService";
import { Layout } from "@/components/layout/Layout";
import { MessageList } from "@/components/chat/MessageList";
import { IbisSubmissionModal } from "@/components/chat/IbisSubmissionModal";
import { MessageInput } from "@/components/chat/MessageInput";
import { ChatModeSelector, ChatMode } from "@/components/chat/ChatModeSelector";
import { IbisMapVisualization } from "@/components/ibis/IbisMapVisualization";
import { useBackendChat } from "@/hooks/useBackendChat";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ViewModeSelector } from "@/components/chat/ViewModeSelector";
import { Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { useIsMobile } from "@/hooks/use-mobile";
import VoiceInterface from "@/components/chat/VoiceInterface";
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
  } = useBackendAuth();
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
  const {
    messages,
    isLoading: chatLoading,
    isTyping,
    sendMessage: originalSendMessage,
    loadChatHistory,
    retryMessage
  } = useBackendChat(deliberationId);
  const sendMessage = async (content: string) => {
    await originalSendMessage(content, chatMode);
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
      console.log('❌ No deliberationId provided');
      return;
    }
    try {
      console.log('🔍 Loading deliberation details:', deliberationId);
      setLoading(true);
      const data = await deliberationService.getDeliberation(deliberationId);
      console.log('✅ Deliberation details loaded successfully:', data);
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
      console.log('🏁 Deliberation details loading completed');
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
      console.error('Failed to join deliberation:', error);
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
  const ChatPanel = () => <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-hidden">
        <MessageList messages={messages} isLoading={chatLoading} isTyping={isTyping} onAddToIbis={handleAddToIbis} onRetry={retryMessage} />
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
  return <Layout>
      <div className="flex flex-col bg-background rounded-lg border min-h-[calc(100vh-120px)]">
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
                  <div className="flex items-center space-x-3">
                    <h1 className="text-xl font-semibold text-democratic-blue break-words">{deliberation.title}</h1>
                    <Badge className={`${getStatusColor(deliberation.status)} text-white`}>{deliberation.status}</Badge>
                  </div>
                  {deliberation.description && (
                    <p className="text-sm text-muted-foreground mt-1">{deliberation.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{(deliberation.participants?.length || deliberation.participant_count || 0)}/{deliberation.max_participants}</span>
                    </div>
                    {!isParticipant && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleJoinDeliberation}
                        disabled={joiningDeliberation}
                      >
                        {joiningDeliberation ? 'Joining...' : 'Join Deliberation'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-stretch gap-3 flex-wrap">
                  <div className="flex flex-col gap-3 h-full">
                    <div className="rounded-lg border bg-muted/40 p-3 flex-1">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Text Mode</div>
                      <ChatModeSelector mode={chatMode} onModeChange={setChatMode} variant="bare" />
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-3 flex-1">
                      <div className="text-xs font-medium text-muted-foreground mb-2">View Mode</div>
                      <ViewModeSelector mode={viewMode} onModeChange={(v) => v && setViewMode(v)} />
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3 h-full">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Voice Mode</div>
                    <VoiceInterface deliberationId={deliberation.id} variant="panel" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {viewMode === 'chat' ? (
            <ChatPanel />
          ) : (
            <IbisMapVisualization deliberationId={deliberation.id} />
          )}
        </div>
        
        {/* IBIS Submission Modal */}
        {deliberation && <IbisSubmissionModal isOpen={ibisModal.isOpen} onClose={handleIbisModalClose} messageId={ibisModal.messageId} messageContent={ibisModal.messageContent} deliberationId={deliberation.id} onSuccess={handleIbisSuccess} />}

      </div>
    </Layout>;
};
export default DeliberationChat;