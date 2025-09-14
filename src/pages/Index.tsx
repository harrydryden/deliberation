import { useEffect, useState } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Users, Vote, Brain, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDeliberationService } from "@/hooks/useDeliberationService";
import { supabase } from "@/integrations/supabase/client";
import { logger } from '@/utils/logger';
const Index = () => {
  const {
    user
  } = useSupabaseAuth();
  const navigate = useNavigate();
  const deliberationService = useDeliberationService();
  const [deliberations, setDeliberations] = useState<any[]>([]);
  useEffect(() => {
    if (!user) {
      navigate("/auth");
    } else {
      checkForLastDeliberationAndRedirect();
    }
  }, [user, navigate]);

  const checkForLastDeliberationAndRedirect = async () => {
    try {
      // First try to find the last deliberation the user wrote a message in
      const lastMessageDeliberation = await findLastMessageDeliberation();
      if (lastMessageDeliberation) {
        navigate(`/deliberations/${lastMessageDeliberation}`);
        return;
      }
      
      // If no messages found, load available deliberations for the landing page
      loadDeliberations();
    } catch (error) {
      logger.error('Failed to check for last deliberation', error);
      loadDeliberations();
    }
  };

  const findLastMessageDeliberation = async (): Promise<string | null> => {
    try {
      if (!user?.id) return null;
      
      // Query for the user's most recent message with a deliberation_id
      const { data, error } = await supabase
        .from('messages')
        .select('deliberation_id')
        .eq('user_id', user.id)
        .not('deliberation_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data?.deliberation_id) {
        return null;
      }

      return data.deliberation_id;
    } catch (error) {
      logger.warn('Failed to find last message deliberation', error);
      return null;
    }
  };
  const loadDeliberations = async () => {
    try {
      const data = await deliberationService.getDeliberations();
      setDeliberations(data);
    } catch (error) {
      logger.error('Failed to load deliberations', error);
      setDeliberations([]);
    }
  };
  if (!user) {
    return null;
  }
  return (
    <div className="max-w-5xl mx-auto space-y-10">
      {/* Welcome Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-democratic-blue">
          Participant Guide
        </h1>
        <p className="text-xl text-muted-foreground">
          Learn how to participate effectively in deliberative discussions
        </p>
      </div>

      {/* How to Participate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            How to Participate
          </CardTitle>
          <CardDescription>
            Your guide to meaningful deliberative engagement
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Share Perspectives
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Contribute your unique viewpoints and experiences to enrich the discussion.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Be Curious
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Seek out other viewpoints and their reasoning.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Vote className="h-5 w-5" />
                  Build on Ideas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Use the IBIS method to structure your thoughts: Issues, Positions, and Arguments.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Stay Engaged
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Regular participation helps move the deliberation forward constructively.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">Quality Guidelines</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Be respectful and constructive in all interactions</li>
              <li>• Support your arguments with evidence when possible</li>
              <li>• Ask clarifying questions to benefit from the knowledge available</li>
              <li>• Please abstain from using inappropriate language including slang</li>
              <li>• Please note that you are able to leave the deliberation at any time</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* IBIS Method */}
      <Card>
        <CardHeader>
          <CardTitle>The IBIS Method</CardTitle>
          <CardDescription>
            Issue-Based Information System for structured thinking
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                ?
              </div>
              <h4 className="font-semibold">Issues</h4>
              <p className="text-sm text-muted-foreground">Questions that need to be resolved</p>
            </div>
            
            <div className="text-center p-4 border rounded-lg">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-2">
                ✓
              </div>
              <h4 className="font-semibold">Positions</h4>
              <p className="text-sm text-muted-foreground">Potential solutions or responses</p>
            </div>
            
            <div className="text-center p-4 border rounded-lg">
              <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-2">
                ±
              </div>
              <h4 className="font-semibold">Arguments</h4>
              <p className="text-sm text-muted-foreground">Reasons for or against positions</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent Interactions */}
      <Card>
        <CardHeader>
          <CardTitle>Working with AI Agents</CardTitle>
          <CardDescription>
            How to interact effectively with AI facilitators and participants
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-2">Agent Capabilities</h4>
            <ul className="space-y-1 text-sm text-blue-800">
              <li>• Help facilitate discussions and keep them on track</li>
              <li>• Provide different perspectives and challenge assumptions</li>
              <li>• Summarise key points and help highlight common topics</li>
              <li>• Ask clarifying questions to deepen understanding</li>
            </ul>
          </div>
          
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
            <h4 className="font-semibold text-amber-900 mb-2">Best Practices</h4>
            <ul className="space-y-1 text-sm text-amber-800">
              <li>• Engage with agents as you would with human participants</li>
              <li>• Use their questions as opportunities to reflect and clarify</li>
              <li>• Don't hesitate to challenge agent perspectives respectfully</li>
              <li>• Remember that agents are tools to enhance, not replace, human deliberation</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Available Deliberations */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Available Deliberations</h2>
          <Button onClick={() => navigate('/deliberations')} variant="outline">
            View All
          </Button>
        </div>
        
        <div className="grid gap-6">
          {deliberations.length > 0 ? (
            deliberations.slice(0, 3).map((deliberation) => (
              <Card key={deliberation.id} className="cursor-pointer hover:shadow-lg transition-shadow" 
                    onClick={() => navigate(`/deliberations`)}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{deliberation.title}</CardTitle>
                    <Badge variant="secondary">{deliberation.status}</Badge>
                  </div>
                  {deliberation.description && (
                    <CardDescription className="line-clamp-2">
                      {deliberation.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>{deliberation.participant_count || 0} participants</span>
                    </div>
                    <Button size="sm">Join Discussion</Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">
                  No deliberations are currently available. Check back later for new discussion sessions.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
export default Index;