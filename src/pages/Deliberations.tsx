import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Clock, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { CreateDeliberationDialog } from "@/components/deliberations/CreateDeliberationDialog";

interface Deliberation {
  id: string;
  title: string;
  description: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  facilitator_id: string;
  is_public: boolean;
  created_at: string;
  participant_count?: number;
  is_participant?: boolean;
}

export default function Deliberations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deliberations, setDeliberations] = useState<Deliberation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const isAdmin = user?.user_metadata?.user_role === 'admin';

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    fetchDeliberations();
  }, [user, navigate]);

  const fetchDeliberations = async () => {
    try {
      setLoading(true);
      
      // Fetch deliberations with participant count
      const { data, error } = await supabase
        .from('deliberations')
        .select(`
          *,
          participants!inner(count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Check which deliberations the user is participating in
      const { data: userParticipations } = await supabase
        .from('participants')
        .select('deliberation_id')
        .eq('user_id', user?.id);

      const participationIds = new Set(userParticipations?.map(p => p.deliberation_id) || []);

      const formattedDeliberations = data?.map(d => ({
        ...d,
        participant_count: d.participants?.length || 0,
        is_participant: participationIds.has(d.id)
      })) || [];

      setDeliberations(formattedDeliberations);
    } catch (error) {
      console.error('Error fetching deliberations:', error);
      toast({
        title: "Error",
        description: "Failed to load deliberations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const joinDeliberation = async (deliberationId: string) => {
    try {
      const { error } = await supabase
        .from('participants')
        .insert({
          deliberation_id: deliberationId,
          user_id: user?.id,
          role: 'participant'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Joined deliberation successfully",
      });

      fetchDeliberations();
    } catch (error) {
      console.error('Error joining deliberation:', error);
      toast({
        title: "Error",
        description: "Failed to join deliberation",
        variant: "destructive",
      });
    }
  };

  const leaveDeliberation = async (deliberationId: string) => {
    try {
      const { error } = await supabase
        .from('participants')
        .delete()
        .eq('deliberation_id', deliberationId)
        .eq('user_id', user?.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Left deliberation successfully",
      });

      fetchDeliberations();
    } catch (error) {
      console.error('Error leaving deliberation:', error);
      toast({
        title: "Error",
        description: "Failed to leave deliberation",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'scheduled': return 'bg-blue-500';
      case 'completed': return 'bg-gray-500';
      default: return 'bg-yellow-500';
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading deliberations...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Deliberations</h1>
            <p className="text-muted-foreground mt-2">
              Participate in structured democratic discussions
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Deliberation
            </Button>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {deliberations.map((deliberation) => (
            <Card key={deliberation.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{deliberation.title}</CardTitle>
                  <Badge 
                    className={`${getStatusColor(deliberation.status)} text-white`}
                  >
                    {deliberation.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {deliberation.description}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <Users className="h-4 w-4 mr-1" />
                      {deliberation.participant_count} participants
                    </div>
                    {deliberation.start_time && (
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-1" />
                        {new Date(deliberation.start_time).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {deliberation.is_participant ? (
                      <>
                        <Button 
                          className="flex-1"
                          onClick={() => navigate(`/deliberations/${deliberation.id}`)}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Enter
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => leaveDeliberation(deliberation.id)}
                        >
                          Leave
                        </Button>
                      </>
                    ) : (
                      <Button 
                        className="w-full"
                        variant="outline"
                        onClick={() => joinDeliberation(deliberation.id)}
                        disabled={deliberation.status === 'completed'}
                      >
                        Join Discussion
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {deliberations.length === 0 && (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">No deliberations available</h3>
            <p className="text-muted-foreground mb-4">
              {isAdmin 
                ? "Create the first deliberation to get started"
                : "Check back later for new discussions"
              }
            </p>
            {isAdmin && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Deliberation
              </Button>
            )}
          </div>
        )}
      </div>

      <CreateDeliberationDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onDeliberationCreated={fetchDeliberations}
      />
    </Layout>
  );
}