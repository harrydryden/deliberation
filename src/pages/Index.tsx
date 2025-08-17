import React, { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Users, Vote, Brain, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDeliberationService } from "@/hooks/useDeliberationService";
const Index = () => {
  const {
    user
  } = useAuth();
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
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Learn how to participate effectively in structured deliberations and what to expect during your session
          </p>
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
                  <span>AI Assistance</span>
                </CardTitle>
                <CardDescription>
                  Three AI agents help guide the conversation: Bill provides policy analysis, Flo manages discussion flow, and Pia offers peer perspectives.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-l-4 border-l-civic-gold">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5 text-civic-gold" />
                  <span>Structured Framework</span>
                </CardTitle>
                <CardDescription>
                  Discussions follow the IBIS method - identifying Issues, exploring Positions, and examining Arguments. This keeps conversations focused and productive.
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
        <div className="bg-muted/30 rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Tips for Effective Participation</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-democratic-blue">During Discussion</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-blue mt-1">•</span>
                  <span>Share your genuine thoughts and experiences</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-blue mt-1">•</span>
                  <span>Ask questions when you need clarification</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-blue mt-1">•</span>
                  <span>Build on what others have said</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-blue mt-1">•</span>
                  <span>Stay focused on the topic at hand</span>
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-democratic-green">Interaction Guidelines</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-green mt-1">•</span>
                  <span>Listen respectfully to different viewpoints</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-green mt-1">•</span>
                  <span>Support your opinions with reasoning</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-green mt-1">•</span>
                  <span>Be open to changing your mind</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-democratic-green mt-1">•</span>
                  <span>Help identify areas of agreement</span>
                </li>
              </ul>
            </div>
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