import { useBackendAuth } from "@/hooks/useBackendAuth";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Users, Vote, Brain, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useDeliberationService } from "@/hooks/useDeliberationService";

const Index = () => {
  const { user } = useBackendAuth();
  const navigate = useNavigate();
  const deliberationService = useDeliberationService();
  const [deliberations, setDeliberations] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    } else {
      loadDeliberations();
    }
  }, [user, navigate]);

  const loadDeliberations = async () => {
    try {
      const data = await deliberationService.getDeliberations();
      setDeliberations(data);
    } catch (error) {
      console.error('Failed to load deliberations:', error);
      setDeliberations([]);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-democratic-blue">
            Available Deliberations
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Join active discussions and engage in meaningful conversations that shape our collective future.
          </p>
        </div>

        {/* Deliberations Grid */}
        {deliberations.length === 0 ? (
          <div className="text-center space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <Card className="border-l-4 border-l-democratic-blue">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MessageSquare className="h-5 w-5 text-democratic-blue" />
                    <span>Structured Discussions</span>
                  </CardTitle>
                  <CardDescription>
                    Participate in deliberations guided by AI agents that facilitate productive dialogue
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-l-4 border-l-democratic-green">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Brain className="h-5 w-5 text-democratic-green" />
                    <span>AI Mediation</span>
                  </CardTitle>
                  <CardDescription>
                    Three specialized AI agents help structure arguments and maintain focus
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-l-4 border-l-civic-gold">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Users className="h-5 w-5 text-civic-gold" />
                    <span>Collaborative Thinking</span>
                  </CardTitle>
                  <CardDescription>
                    Build on each other's ideas in a respectful, structured environment
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-l-4 border-l-primary">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Vote className="h-5 w-5 text-primary" />
                    <span>IBIS Framework</span>
                  </CardTitle>
                  <CardDescription>
                    Organize thoughts using Issues, Positions, and Arguments for clarity
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No deliberations available</h3>
                <p className="text-muted-foreground text-center mb-4">
                  No deliberations have been created yet. Please contact an administrator to set up new discussions.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {deliberations.map((deliberation: any) => (
              <Card key={deliberation.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg line-clamp-2">{deliberation.title}</CardTitle>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      deliberation.status === 'active' ? 'bg-green-100 text-green-800' :
                      deliberation.status === 'completed' ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {deliberation.status}
                    </span>
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
                      <span>{deliberation.participant_count || 0}/{deliberation.max_participants || 50}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="h-4 w-4" />
                      <span>{new Date(deliberation.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <Button 
                    className="w-full bg-democratic-blue hover:bg-democratic-blue/90"
                    onClick={() => navigate(`/deliberations/${deliberation.id}`)}
                  >
                    Join Discussion
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Index;
