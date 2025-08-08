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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Settings, ExternalLink, MessageSquare, GitBranch, LayoutSplit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";

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
  const { deliberationId } = useParams<{ deliberationId: string }>();
  const { user, isLoading } = useBackendAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const deliberationService = useDeliberationService();
  
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [loading, setLoading] = useState(true);
  const [isParticipant, setIsParticipant] = useState(false);
  const [joiningDeliberation, setJoiningDeliberation] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('chat');
  const [activeTab, setActiveTab] = useState<'chat' | 'ibis'>('chat');
  const [ibisModal, setIbisModal] = useState<{
    isOpen: boolean;
    messageId: string;
    messageContent: string;
  }>({
    isOpen: false,
    messageId: '',
    messageContent: ''
  });
  

  const {
    messages,
    isLoading: chatLoading,
    isTyping,
    sendMessage: originalSendMessage,
    loadChatHistory,
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
        description: "You have joined the deliberation",
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
      case 'active': return 'bg-green-500';
      case 'completed': return 'bg-gray-500';
      default: return 'bg-yellow-500';
    }
  };

  if (isLoading || loading) {
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

  if (!user || !deliberation) return null;

  return (
    <Layout>
      <div className="flex flex-col bg-background rounded-lg border min-h-[calc(100vh-120px)]">
        {/* Deliberation Header - Sticky below main header */}
        <div 
          className="border-b p-4 bg-card backdrop-blur-sm"
          style={{ 
            position: 'sticky', 
            top: '64px', 
            zIndex: 40,
            backgroundColor: 'hsl(var(--card) / 0.95)'
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-3">
                <h1 className="text-xl font-semibold text-democratic-blue truncate">
                  {deliberation.title}
                </h1>
                <Badge className={`${getStatusColor(deliberation.status)} text-white`}>
                  {deliberation.status}
                </Badge>
              </div>
              {deliberation.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {deliberation.description}
                </p>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <ChatModeSelector mode={chatMode} onModeChange={setChatMode} />
              
              <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{deliberation.participants?.length || deliberation.participant_count || 0}/{deliberation.max_participants}</span>
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
              
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/deliberations")}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                All Deliberations
              </Button>
            </div>
          </div>
        </div>
        
        {/* Main Content Tabs */}
        <div className="flex-1 flex flex-col">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'chat' | 'ibis')} className="flex-1 flex flex-col">
            <div 
              className="border-b px-4 bg-background backdrop-blur-sm"
              style={{ 
                position: 'sticky', 
                top: '152px', 
                zIndex: 30,
                backgroundColor: 'hsl(var(--background) / 0.95)'
              }}
            >
              <TabsList className="grid w-[400px] grid-cols-2">
                <TabsTrigger value="chat" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Chat
                </TabsTrigger>
                <TabsTrigger value="ibis" className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  IBIS Map
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="chat" className="flex-1 flex flex-col mt-0">
              <MessageList 
                messages={messages} 
                isLoading={chatLoading} 
                isTyping={isTyping}
                onAddToIbis={handleAddToIbis}
              />
              
              <MessageInput 
                onSendMessage={sendMessage} 
                disabled={isTyping || deliberation.status === 'completed'}
              />
            </TabsContent>
            
            <TabsContent value="ibis" className="flex-1 mt-0">
              <IbisMapVisualization deliberationId={deliberation.id} />
            </TabsContent>
          </Tabs>
        </div>
        
        {/* IBIS Submission Modal */}
        {deliberation && (
          <IbisSubmissionModal
            isOpen={ibisModal.isOpen}
            onClose={handleIbisModalClose}
            messageId={ibisModal.messageId}
            messageContent={ibisModal.messageContent}
            deliberationId={deliberation.id}
            onSuccess={handleIbisSuccess}
          />
        )}
      </div>
    </Layout>
  );
};

export default DeliberationChat;