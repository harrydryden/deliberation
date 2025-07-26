import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Users, Clock, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDeliberationService } from "@/hooks/useDeliberationService";

interface Deliberation {
  id: string;
  title: string;
  description?: string;
  status: 'draft' | 'active' | 'completed';
  facilitator_id?: string;
  is_public: boolean;
  max_participants: number;
  start_time?: string;
  end_time?: string;
  created_at: string;
  participant_count?: number;
}

const Deliberations = () => {
  const { user, isLoading } = useBackendAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const deliberationService = useDeliberationService();
  
  const [deliberations, setDeliberations] = useState<Deliberation[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    is_public: true,
    max_participants: 50
  });

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
      return;
    }
    
    if (user) {
      loadDeliberations();
    }
  }, [user, isLoading, navigate]);

  const loadDeliberations = async () => {
    try {
      setLoading(true);
      const data = await deliberationService.getDeliberations();
      setDeliberations(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load deliberations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDeliberation = async () => {
    try {
      const deliberation = await deliberationService.createDeliberation(formData);
      toast({
        title: "Success",
        description: "Deliberation created successfully"
      });
      setCreateOpen(false);
      setFormData({ title: '', description: '', is_public: true, max_participants: 50 });
      navigate(`/deliberations/${deliberation.id}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create deliberation",
        variant: "destructive"
      });
    }
  };

  const handleJoinDeliberation = async (deliberationId: string) => {
    try {
      await deliberationService.joinDeliberation(deliberationId);
      toast({
        title: "Success",
        description: "Joined deliberation successfully"
      });
      navigate(`/deliberations/${deliberationId}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to join deliberation",
        variant: "destructive"
      });
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
        <div className="max-w-6xl mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 bg-muted rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!user) return null;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-democratic-blue">Deliberations</h1>
            <p className="text-muted-foreground">Join ongoing discussions or create new ones</p>
          </div>
          
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-democratic-blue hover:bg-democratic-blue/90">
                <Plus className="h-4 w-4 mr-2" />
                Create Deliberation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Deliberation</DialogTitle>
                <DialogDescription>
                  Set up a new deliberation for structured discussion
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter deliberation title"
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what this deliberation is about"
                    rows={3}
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_public"
                    checked={formData.is_public}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_public: checked }))}
                  />
                  <Label htmlFor="is_public">Public deliberation</Label>
                </div>
                
                <div>
                  <Label htmlFor="max_participants">Maximum Participants</Label>
                  <Input
                    id="max_participants"
                    type="number"
                    value={formData.max_participants}
                    onChange={(e) => setFormData(prev => ({ ...prev, max_participants: parseInt(e.target.value) || 50 }))}
                    min={2}
                    max={200}
                  />
                </div>
                
                <Button 
                  onClick={handleCreateDeliberation}
                  className="w-full bg-democratic-blue hover:bg-democratic-blue/90"
                  disabled={!formData.title.trim()}
                >
                  Create Deliberation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Deliberations Grid */}
        {deliberations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No deliberations found</h3>
              <p className="text-muted-foreground text-center mb-4">
                Be the first to create a deliberation and start a meaningful discussion
              </p>
              <Button 
                onClick={() => setCreateOpen(true)}
                className="bg-democratic-blue hover:bg-democratic-blue/90"
              >
                Create First Deliberation
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {deliberations.map((deliberation) => (
              <Card key={deliberation.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg line-clamp-2">{deliberation.title}</CardTitle>
                    <Badge className={`${getStatusColor(deliberation.status)} text-white`}>
                      {deliberation.status}
                    </Badge>
                  </div>
                  {deliberation.description && (
                    <CardDescription className="line-clamp-3">
                      {deliberation.description}
                    </CardDescription>
                  )}
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center space-x-1">
                      <Users className="h-4 w-4" />
                      <span>{deliberation.participant_count || 0}/{deliberation.max_participants}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="h-4 w-4" />
                      <span>{new Date(deliberation.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      className="flex-1 bg-democratic-blue hover:bg-democratic-blue/90"
                      onClick={() => handleJoinDeliberation(deliberation.id)}
                    >
                      Join Discussion
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => navigate(`/deliberations/${deliberation.id}/details`)}
                    >
                      Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Deliberations;