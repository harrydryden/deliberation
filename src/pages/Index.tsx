import React, { useEffect, useState } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Users, Vote, Brain, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDeliberationService } from "@/hooks/useDeliberationService";
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
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Welcome Section */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-democratic-blue">
            Participant Guide
          </h1>
          <p className="text-muted-foreground max-w-3xl mx-auto text-base py-0">Important note. Topics may be sensitive, you are able to stop participating at any time.  Third party tools may access information you share during the deliberation, do not share personal information.  The agents use OpenAI LLMs (AI) and may provide inaccurate information. </p>
        </div>

        {/* How to Participate */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-foreground">How Deliberations Work</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-democratic-blue/10 rounded-lg flex items-center justify-center mb-3">
                  <MessageSquare className="h-6 w-6 text-democratic-blue" />
                </div>
                <CardTitle className="text-lg">1. Join Your Session</CardTitle>
                <CardDescription>When you enter a deliberation, you'll see the topic and note the number of other participants. Take a moment to read the background information provided.</CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-democratic-green/10 rounded-lg flex items-center justify-center mb-3">
                  <Brain className="h-6 w-6 text-democratic-green" />
                </div>
                <CardTitle className="text-lg">2. Share Your Thoughts</CardTitle>
                <CardDescription>Learn about the topic and engage with other participants through agents. The agents help organise and structure information, helping the discourse. </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-civic-gold/10 rounded-lg flex items-center justify-center mb-3">
                  <Vote className="h-6 w-6 text-civic-gold" />
                </div>
                <CardTitle className="text-lg">3. Build Together</CardTitle>
                <CardDescription>
                  Work with others to identify issues, explore different viewpoints, and understand the reasoning behind various positions.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* What to Expect */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-foreground">What You'll Experience</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-l-4 border-l-democratic-blue">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MessageSquare className="h-5 w-5 text-democratic-blue" />
                  <span>Live Discussion</span>
                </CardTitle>
                <CardDescription>
                  Your messages appear instantly for all participants. You'll see responses from both other participants and AI facilitators in real-time.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-democratic-green">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-democratic-green" />
                  <span>Guided Discussion</span>
                </CardTitle>
                <CardDescription>
                  Three AI agents help guide the conversation: Bill provides facts particularly policy information, Flo mediates the discussion, and most importantly Pia facilitates the exchange of views between participants.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-civic-gold">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5 text-civic-gold" />
                  <span>IBIS Discussion Method</span>
                </CardTitle>
                <CardDescription>
                  Discussions follow the IBIS method - identifying Issues, related Positions, and associated Arguments. This helps to organise the discussion - which you can see in the map view, or ask Pia.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Vote className="h-5 w-5 text-primary" />
                  <span>Multiple Input Methods</span>
                </CardTitle>
                <CardDescription>
                  You can participate by typing messages or speaking aloud. Voice messages are transcribed automatically, making participation accessible.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* Participation Tips */}
        

        {/* Interface Features */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-foreground">Understanding the Interface</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Mode Toggles */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MessageSquare className="h-5 w-5 text-democratic-blue" />
                  <span>Interface Toggles</span>
                </CardTitle>
                <CardDescription className="space-y-3">
                  <div>
                    <p className="font-medium text-foreground">Chat Mode Switch:</p>
                    <p className="text-sm">Toggle between "Deliberate" (join the group discussion) and "Policy Q&A" (ask questions to experts privately).</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">View Mode Switch:</p>
                    <p className="text-sm">Switch between "Message" view (see conversation flow) and "Map" view (visualize the discussion structure using IBIS methodology).</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Voice Mode:</p>
                    <p className="text-sm">Speak directly with agents using real-time voice chat—simply click and have a proper conversation.</p>
                  </div>
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Agent Orchestration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-democratic-green" />
                  <span>AI Agent Team</span>
                </CardTitle>
                <CardDescription className="space-y-3">
                  <div>
                    <p className="font-medium text-blue-600">Bill:</p>
                    <p className="text-sm">Provides policy analysis and legislative context to inform your discussions.</p>
                  </div>
                  <div>
                    <p className="font-medium text-green-600">Flo:</p>
                    <p className="text-sm">Manages conversation flow, ensures balanced participation, and guides discussion structure.</p>
                  </div>
                  <div>
                    <p className="font-medium text-purple-600">Pia:</p>
                    <p className="text-sm">Offers peer perspectives and helps synthesize different viewpoints in the conversation.</p>
                  </div>
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Scoring System */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5 text-civic-gold" />
                  <span>Engagement Metrics</span>
                </CardTitle>
                <CardDescription className="space-y-3">
                  <div>
                    <p className="font-medium text-foreground">Engagement Stars:</p>
                    <p className="text-sm">Measures your active participation in discussions (messages, responses, questions).</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Shares & Sessions:</p>
                    <p className="text-sm">Tracks how often you contribute insights and attend deliberation sessions.</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Helpfulness:</p>
                    <p className="text-sm">Reflects how your contributions help advance the group's understanding and decision-making.</p>
                  </div>
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* Getting Started */}
        <div className="text-center space-y-4 bg-gradient-to-r from-democratic-blue/5 to-democratic-green/5 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-foreground">Ready to Begin?</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Choose from available deliberations below, or check back later for new discussion topics.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {deliberations.length > 0 ? <Button className="bg-democratic-blue hover:bg-democratic-blue/90 text-white" onClick={() => navigate("/deliberations")}>
                Join a Deliberation
              </Button> : <p className="text-muted-foreground">
                No deliberations are currently available. Check back later for new discussion sessions.
              </p>}
          </div>
        </div>
      </div>
    </Layout>;
};
export default Index;