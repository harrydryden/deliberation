import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Clock, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatToUKDate } from "@/utils/timeUtils";
import { useDeliberationService } from "@/hooks/useDeliberationService";
import { logger } from "@/utils/logger";
import { Deliberation } from "@/types/index";
interface DeliberationWithStats extends Deliberation {
  participant_count?: number;
  is_user_participant?: boolean;
  created_at: string; // Keep both for compatibility
}
const Deliberations = () => {
  const {
    user,
    isLoading,
    isAdmin
  } = useSupabaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const deliberationService = useDeliberationService();
  const [deliberations, setDeliberations] = useState<DeliberationWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDescription, setSelectedDescription] = useState<{
    title: string;
    description: string;
  } | null>(null);
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
      logger.info('Loading deliberations...');
      setLoading(true);
      logger.info('About to call deliberationService.getDeliberations()');
      const data = await deliberationService.getDeliberations();
      logger.info('Deliberations loaded successfully', {
        count: data?.length || 0,
        data
      });
      setDeliberations(data as DeliberationWithStats[]);
    } catch (error) {
      logger.error('Failed to load deliberations', error as any);
      toast({
        title: "Error",
        description: "Failed to load deliberations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      logger.info('Loading deliberations completed');
    }
  };
  const handleJoinDeliberation = async (deliberationId: string) => {
    try {
      logger.info('Attempting to join deliberation', {
        deliberationId
      });
      const deliberation = deliberations.find(d => d.id === deliberationId);
      const isRejoining = deliberation?.is_user_participant;
      await deliberationService.joinDeliberation(deliberationId);
      logger.info('Join deliberation successful');

      // Only show success toast if user is joining for the first time
      if (!isRejoining) {
        toast({
          title: "Success",
          description: "Joined deliberation successfully"
        });
      }
      logger.info('Navigating to deliberation', {
        deliberationId
      });
      navigate(`/deliberations/${deliberationId}`);
    } catch (error) {
      logger.error('Failed to join deliberation', error as any);
      toast({
        title: "Error",
        description: "Failed to join deliberation",
        variant: "destructive"
      });
    }
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'completed':
        return 'bg-gray-500';
      default:
        return 'bg-yellow-500';
    }
  };
  if (isLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-48 bg-muted rounded-lg"></div>)}
          </div>
        </div>
      </div>
    );
  }
  if (!user) return null;
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-democratic-blue">Available Deliberations</h1>
          <p className="text-muted-foreground">Join these active deliberations and to share your views and learn from others</p>
        </div>
      </div>

      {/* Deliberations Grid */}
      {deliberations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No deliberations available</h3>
            <p className="text-muted-foreground text-center mb-4">
              No deliberations have been created yet. Please contact an administrator to set up new discussions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {deliberations.map(deliberation => (
            <Card key={deliberation.id} className="hover:shadow-lg transition-shadow flex flex-col h-full">
              <CardHeader className="flex-1">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg line-clamp-2">{deliberation.title}</CardTitle>
                  <Badge className={`${getStatusColor(deliberation.status)} text-white`}>
                    {deliberation.status}
                  </Badge>
                </div>
                {deliberation.description && (
                  <CardDescription 
                    className="line-clamp-3 cursor-pointer hover:text-primary transition-colors" 
                    onClick={() => setSelectedDescription({
                      title: deliberation.title,
                      description: deliberation.description!
                    })}
                  >
                    {deliberation.description}
                  </CardDescription>
                )}
              </CardHeader>
              
              <CardContent className="space-y-4 mt-auto">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center space-x-1">
                    <Users className="h-4 w-4" />
                    <span>{deliberation.participant_count || 0}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Clock className="h-4 w-4" />
                    <span>{formatToUKDate(new Date(deliberation.created_at))}</span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    className="flex-1 bg-democratic-blue hover:bg-democratic-blue/90" 
                    onClick={() => handleJoinDeliberation(deliberation.id)}
                  >
                    {isAdmin ? "View" : deliberation.is_user_participant ? "Rejoin Discussion" : "Join Discussion"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Description Preview Dialog */}
      <Dialog open={!!selectedDescription} onOpenChange={() => setSelectedDescription(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedDescription?.title}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 text-muted-foreground whitespace-pre-wrap">
            {selectedDescription?.description}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Deliberations;