import React, { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Users, Vote, Brain, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDeliberationService } from "@/hooks/useDeliberationService";

const Index = () => {
  const { user } = useAuth();
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
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <h1 className="text-5xl font-bold text-democratic-blue">
            Welcome to Deliberation
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            A revolutionary platform that combines AI-assisted facilitation with structured democratic discourse to transform how communities engage with complex issues
          </p>
        </div>

        {/* How It Works Section */}
        <div className="space-y-8">
          <h2 className="text-3xl font-bold text-center text-foreground">How Deliberation Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto w-16 h-16 bg-democratic-blue/10 rounded-full flex items-center justify-center mb-4">
                  <MessageSquare className="h-8 w-8 text-democratic-blue" />
                </div>
                <CardTitle>Join a Discussion</CardTitle>
                <CardDescription>
                  Enter a deliberation room focused on a specific topic or policy issue where you'll engage with other participants
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto w-16 h-16 bg-democratic-green/10 rounded-full flex items-center justify-center mb-4">
                  <Brain className="h-8 w-8 text-democratic-green" />
                </div>
                <CardTitle>AI-Guided Conversation</CardTitle>
                <CardDescription>
                  Specialized AI agents facilitate the discussion, provide relevant information, and help structure your thoughts using the IBIS framework
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto w-16 h-16 bg-civic-gold/10 rounded-full flex items-center justify-center mb-4">
                  <Vote className="h-8 w-8 text-civic-gold" />
                </div>
                <CardTitle>Build Understanding</CardTitle>
                <CardDescription>
                  Collaborate to identify key issues, explore different positions, and examine supporting arguments in a structured way
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* Key Features Section */}
        <div className="space-y-8">
          <h2 className="text-3xl font-bold text-center text-foreground">Platform Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="border-l-4 border-l-democratic-blue">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MessageSquare className="h-5 w-5 text-democratic-blue" />
                  <span>Real-time Collaboration</span>
                </CardTitle>
                <CardDescription>
                  Engage in live discussions with participants from around the world, with messages instantly shared and organized
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-democratic-green">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-democratic-green" />
                  <span>AI Facilitation</span>
                </CardTitle>
                <CardDescription>
                  Three specialized agents work together: Bill analyzes policies, Flo manages conversation flow, and Pia provides peer insights
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-civic-gold">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5 text-civic-gold" />
                  <span>IBIS Framework</span>
                </CardTitle>
                <CardDescription>
                  Structure discussions using Issues, Positions, and Arguments - a proven methodology for complex decision-making
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Vote className="h-5 w-5 text-primary" />
                  <span>Voice Integration</span>
                </CardTitle>
                <CardDescription>
                  Participate using voice input for more natural conversations, with real-time transcription and audio responses
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-muted-foreground">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span>Knowledge Integration</span>
                </CardTitle>
                <CardDescription>
                  Access verified information and research documents that inform the discussion with evidence-based insights
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-accent">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-accent" />
                  <span>Structured Output</span>
                </CardTitle>
                <CardDescription>
                  Generate clear summaries and visual maps of the discussion that capture key insights and areas of consensus
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="bg-muted/30 rounded-lg p-8 space-y-6">
          <h2 className="text-3xl font-bold text-center text-foreground">Why Use Deliberation?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-democratic-blue">For Citizens</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-blue mt-1">•</span>
                  <span>Engage with complex policy issues in an accessible format</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-blue mt-1">•</span>
                  <span>Learn from diverse perspectives and evidence-based information</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-blue mt-1">•</span>
                  <span>Contribute meaningfully to democratic discourse</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-blue mt-1">•</span>
                  <span>Develop critical thinking and deliberation skills</span>
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-democratic-green">For Organizations</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-green mt-1">•</span>
                  <span>Gather structured public input on policy proposals</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-green mt-1">•</span>
                  <span>Facilitate productive stakeholder consultations</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-green mt-1">•</span>
                  <span>Generate actionable insights from community discussions</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-green mt-1">•</span>
                  <span>Build transparency and trust in decision-making processes</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center space-y-6 bg-gradient-to-r from-democratic-blue/5 to-democratic-green/5 rounded-lg p-8">
          <h2 className="text-3xl font-semibold text-foreground">Ready to Start Deliberating?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Join ongoing discussions or contact an administrator to set up deliberations for your community or organization
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {deliberations.length > 0 ? (
              <Button 
                className="bg-democratic-blue hover:bg-democratic-blue/90 text-white px-8 py-3 text-lg" 
                onClick={() => navigate("/deliberations")}
              >
                View Available Deliberations
              </Button>
            ) : (
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  No deliberations are currently available. Contact an administrator to set up new discussions.
                </p>
                <Button 
                  variant="outline" 
                  className="border-democratic-blue text-democratic-blue hover:bg-democratic-blue/10"
                  onClick={() => navigate("/auth")}
                >
                  Sign In to Get Notified
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Index;