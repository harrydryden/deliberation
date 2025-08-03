import React, { useEffect, useState } from "react";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Users, Vote, Brain, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDeliberationService } from "@/hooks/useDeliberationService";
const Index = () => {
  const {
    user
  } = useBackendAuth();
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
  return <Layout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-democratic-blue">
            Welcome to Deliberation
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Shape the future of democracy</p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-l-4 border-l-democratic-blue">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-democratic-blue" />
                <span>Structured Discussions</span>
              </CardTitle>
              <CardDescription>Participate in topically conversations to learn and have your say on important topics</CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-l-4 border-l-democratic-green">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5 text-democratic-green" />
                <span>Mediation</span>
              </CardTitle>
              <CardDescription>Agents facilitate an intuitive dialogue with your peers and with verified knowledge sources</CardDescription>
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
                <span>Framework</span>
              </CardTitle>
              <CardDescription>Organise collective thoughts using Issues, Positions, and Arguments for clarity</CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Call to Action */}
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Get started here</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {deliberations.length > 0 ? <Button className="bg-democratic-blue hover:bg-democratic-blue/90" onClick={() => navigate("/deliberations")}>
                View Available Deliberations
              </Button> : <p className="text-muted-foreground text-center">
                No deliberations are currently available. Please contact an administrator to set up new discussions.
              </p>}
            {user?.role === 'admin' && (
              <Button variant="ghost" onClick={() => navigate("/backend")}>
                Backend Config
              </Button>
            )}
          </div>
        </div>
      </div>
    </Layout>;
};
export default Index;