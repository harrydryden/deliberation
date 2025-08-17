import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useServices } from "@/hooks/useServices";
import { useChat } from "@/hooks/useChat";
import { useUserAgents } from "@/hooks/useUserAgents";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { IbisSubmissionModal } from "@/components/chat/IbisSubmissionModal";
import type { Deliberation } from "@/types/api";

const DeliberationChat = () => {
  const { deliberationId } = useParams<{ deliberationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { deliberationService } = useServices();
  const { messages, isLoading, isTyping, sendMessage, retryMessage } = useChat(deliberationId);
  const { localAgents, loading: agentsLoading } = useUserAgents();
  const { toast } = useToast();
  
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [isLoadingDeliberation, setIsLoadingDeliberation] = useState(true);
  const [isSubmissionModalOpen, setIsSubmissionModalOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<{ id: string; content: string } | null>(null);

  // Store the current deliberation as the last visited one
  useEffect(() => {
    if (deliberationId) {
      console.log('Storing last deliberation ID:', deliberationId);
      localStorage.setItem('last_deliberation_id', deliberationId);
    }
  }, [deliberationId]);

  // Load deliberation details
  useEffect(() => {
    const loadDeliberation = async () => {
      if (!deliberationId) return;
      
      try {
        setIsLoadingDeliberation(true);
        const deliberations = await deliberationService.getDeliberations({ id: deliberationId });
        
        if (deliberations.length > 0) {
          setDeliberation(deliberations[0]);
        } else {
          toast({
            title: "Deliberation not found",
            description: "The deliberation you're looking for doesn't exist or you don't have access.",
            variant: "destructive",
          });
          navigate('/deliberations');
        }
      } catch (error) {
        console.error('Failed to load deliberation:', error);
        toast({
          title: "Error loading deliberation",
          description: "Failed to load deliberation details. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingDeliberation(false);
      }
    };

    loadDeliberation();
  }, [deliberationId, deliberationService, navigate, toast]);

  const handleAddToIbis = (messageId: string, content: string) => {
    setSelectedMessage({ id: messageId, content });
    setIsSubmissionModalOpen(true);
  };

  const handleSubmissionSuccess = () => {
    setIsSubmissionModalOpen(false);
    setSelectedMessage(null);
    toast({
      title: "Success",
      description: "Your message has been submitted to the IBIS knowledge map.",
    });
  };

  if (isLoadingDeliberation) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!deliberation) {
    return null; // Navigation will handle redirect
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/deliberations')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Deliberations
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{deliberation.title}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>Active Discussion</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              <span>{messages.length} messages</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="flex-1 flex flex-col h-[calc(100vh-12rem)]">
          <CardHeader className="pb-4">
            <CardTitle>Discussion</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0">
            <div className="flex-1 overflow-hidden">
              <MessageList
                messages={messages}
                isLoading={isLoading}
                isTyping={isTyping}
                onAddToIbis={handleAddToIbis}
                onRetry={retryMessage}
                deliberationId={deliberationId}
                agentConfigs={localAgents}
              />
            </div>
            <div className="border-t p-4">
              <MessageInput
                onSendMessage={sendMessage}
                disabled={isTyping}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <IbisSubmissionModal
        isOpen={isSubmissionModalOpen}
        onClose={() => setIsSubmissionModalOpen(false)}
        onSuccess={handleSubmissionSuccess}
        messageId={selectedMessage?.id || ''}
        messageContent={selectedMessage?.content || ''}
        deliberationId={deliberationId || ''}
      />
    </div>
  );
};

export default DeliberationChat;
