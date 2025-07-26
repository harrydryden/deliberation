import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";
import { useDeliberationService } from "@/hooks/useDeliberationService";
import { Layout } from "@/components/layout/Layout";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { useBackendChat } from "@/hooks/useBackendChat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Settings, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Deliberation {
  id: string;
  title: string;
  description?: string;
  status: 'draft' | 'active' | 'completed';
  facilitator_id?: string;
  is_public: boolean;
  max_participants: number;
  participants?: any[];
}

const DeliberationChat = () => {
  const { deliberationId } = useParams<{ deliberationId: string }>();
  const { user, isLoading } = useBackendAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const deliberationService = useDeliberationService();
  
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Enable token refresh for authenticated users
  useTokenRefresh();

  const {
    messages,
    isLoading: chatLoading,
    isTyping,
    sendMessage,
  } = useBackendChat(deliberationId);

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
    if (!deliberationId) return;
    
    try {
      setLoading(true);
      const data = await deliberationService.getDeliberation(deliberationId);
      setDeliberation(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load deliberation",
        variant: "destructive"
      });
      navigate("/deliberations");
    } finally {
      setLoading(false);
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
      <div className="h-[calc(100vh-120px)] flex flex-col bg-background rounded-lg border">
        {/* Deliberation Header */}
        <div className="border-b p-4 bg-card">
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
              <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{deliberation.participants?.length || 0}/{deliberation.max_participants}</span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/deliberations/${deliberationId}/details`)}
              >
                <Settings className="h-4 w-4 mr-1" />
                Details
              </Button>
              
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
        
        {/* Chat Interface */}
        <MessageList 
          messages={messages} 
          isLoading={chatLoading} 
          isTyping={isTyping}
        />
        
        <MessageInput 
          onSendMessage={sendMessage} 
          disabled={isTyping || deliberation.status === 'completed'}
        />
      </div>
    </Layout>
  );
};

export default DeliberationChat;