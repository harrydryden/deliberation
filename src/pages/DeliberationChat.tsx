import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { usePresence } from "@/hooks/usePresence";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Users, ArrowLeft, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface Deliberation {
  id: string;
  title: string;
  description: string;
  status: string;
  participant_count?: number;
}

interface Profile {
  id: string;
  display_name: string;
}

export default function DeliberationChat() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);

  // Use custom hooks for realtime functionality
  const { messages, loading: messagesLoading, sendMessage } = useRealtimeMessages(id);
  const { onlineUsers } = usePresence(id, user?.id, userProfile?.display_name);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (!id) {
      navigate('/deliberations');
      return;
    }
    
    fetchDeliberation();
    fetchUserProfile();
  }, [user, id, navigate]);

  const fetchUserProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const fetchDeliberation = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
        .from('deliberations')
        .select(`
          *,
          participants(count)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      setDeliberation({
        ...data,
        participant_count: data.participants?.length || 0
      });
    } catch (error) {
      console.error('Error fetching deliberation:', error);
      toast({
        title: "Error",
        description: "Failed to load deliberation",
        variant: "destructive",
      });
      navigate('/deliberations');
    }
  };


  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return;

    try {
      setSending(true);
      await sendMessage(newMessage, user.id);
      setNewMessage("");
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getMessageTypeColor = (type: string) => {
    switch (type) {
      case 'bill_agent':
      case 'peer_agent':
      case 'flow_agent': return 'bg-blue-100 border-blue-200';
      default: return 'bg-white border-gray-200';
    }
  };

  if (messagesLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading deliberation...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!deliberation) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h3 className="text-lg font-medium mb-2">Deliberation not found</h3>
          <Button onClick={() => navigate('/deliberations')}>
            Back to Deliberations
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/deliberations')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{deliberation.title}</h1>
              <p className="text-muted-foreground">{deliberation.description}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Badge variant="secondary" className="flex items-center">
              <Users className="h-3 w-3 mr-1" />
              {deliberation.participant_count} participants
            </Badge>
            <Badge variant="outline" className="flex items-center">
              <Circle className="h-2 w-2 mr-1 fill-green-500 text-green-500" />
              {onlineUsers.length} online
            </Badge>
            <Badge>{deliberation.status}</Badge>
          </div>
        </div>

        {/* Chat Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Messages Area */}
          <div className="lg:col-span-3">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Discussion</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {/* Messages Container */}
                <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                  {messages.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <p>No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`p-3 rounded-lg border ${getMessageTypeColor(message.message_type)}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-sm">
                              {['bill_agent', 'peer_agent', 'flow_agent'].includes(message.message_type)
                                ? 'AI Mediator' 
                                : message.profiles?.display_name || 'Anonymous'
                              }
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {message.message_type}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(message.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Message Input */}
                <div className="flex space-x-2">
                  <Input
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleSendMessage} 
                    disabled={!newMessage.trim() || sending}
                    size="sm"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Online Users */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Circle className="h-3 w-3 mr-2 fill-green-500 text-green-500" />
                  Online ({onlineUsers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {onlineUsers.map((user) => (
                    <div key={user.user_id} className="flex items-center space-x-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {user.display_name?.charAt(0)?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{user.display_name || 'Anonymous'}</span>
                    </div>
                  ))}
                  {onlineUsers.length === 0 && (
                    <p className="text-sm text-muted-foreground">No users online</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Information Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">About this deliberation</h4>
                  <p className="text-sm text-muted-foreground">
                    {deliberation.description}
                  </p>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Guidelines</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Be respectful and constructive</li>
                    <li>• Stay on topic</li>
                    <li>• Consider multiple perspectives</li>
                    <li>• Build on others' ideas</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}