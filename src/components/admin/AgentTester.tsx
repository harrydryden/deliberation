import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Send, Copy, RotateCcw } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export const AgentTester = () => {
  const { toast } = useToast();
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [testInput, setTestInput] = useState("");
  const [testContext, setTestContext] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { data: configs } = useQuery({
    queryKey: ["agent-configurations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_configurations")
        .select("*")
        .eq("is_default", true)
        .eq("is_active", true)
        .order("agent_type");
      
      if (error) throw error;
      return data;
    },
  });

  const handleTest = async () => {
    if (!selectedAgent || !testInput.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select an agent and provide test input.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Call the appropriate agent based on selection
      const functionName = selectedAgent.replace('_agent', '-agent');
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          content: testInput,
          user_id: "test-user-id", // Use a test user ID
          message_id: "test-message-id",
          deliberation_id: testContext || null,
        },
      });

      if (error) throw error;

      setTestResponse(data.response || "No response received");
      toast({
        title: "Test Completed",
        description: "Agent response generated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Test Failed",
        description: `Failed to test agent: ${error.message}`,
        variant: "destructive",
      });
      setTestResponse(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyResponse = () => {
    navigator.clipboard.writeText(testResponse);
    toast({
      title: "Copied",
      description: "Response copied to clipboard.",
    });
  };

  const handleReset = () => {
    setTestInput("");
    setTestContext("");
    setTestResponse("");
  };

  const agentOptions = [
    { value: "bill_agent", label: "Bill Agent", description: "IBIS structure facilitator" },
    { value: "peer_agent", label: "Peer Agent", description: "Peer interaction facilitator" },
    { value: "flow_agent", label: "Flow Agent", description: "Discussion flow manager" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Test Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-select">Select Agent</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an agent to test" />
                </SelectTrigger>
                <SelectContent>
                  {agentOptions.map((agent) => (
                    <SelectItem key={agent.value} value={agent.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{agent.label}</span>
                        <span className="text-xs text-muted-foreground">{agent.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-input">Test Message</Label>
              <Textarea
                id="test-input"
                rows={4}
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Enter a test message to send to the agent..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-context">Context (Optional)</Label>
              <Input
                id="test-context"
                value={testContext}
                onChange={(e) => setTestContext(e.target.value)}
                placeholder="Deliberation ID or additional context"
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleTest} 
                disabled={isLoading || !selectedAgent || !testInput.trim()}
                className="flex-1"
              >
                <Send className="h-4 w-4 mr-2" />
                {isLoading ? "Testing..." : "Test Agent"}
              </Button>
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Agent Response</CardTitle>
            {testResponse && (
              <Button variant="outline" size="sm" onClick={handleCopyResponse}>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {testResponse ? (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-md min-h-[200px]">
                  <pre className="text-sm whitespace-pre-wrap break-words">
                    {testResponse}
                  </pre>
                </div>
                <div className="text-xs text-muted-foreground">
                  Response generated from {selectedAgent?.replace('_', ' ')} agent
                </div>
              </div>
            ) : (
              <div className="bg-muted p-4 rounded-md min-h-[200px] flex items-center justify-center text-muted-foreground">
                Agent response will appear here after testing
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {configs && (
        <Card>
          <CardHeader>
            <CardTitle>Current Agent Configurations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {configs.map((config) => (
                <div key={config.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">{config.name}</h4>
                    <span className="text-xs text-muted-foreground">
                      {config.agent_type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  {config.description && (
                    <p className="text-sm text-muted-foreground mb-2">{config.description}</p>
                  )}
                  <Separator className="my-2" />
                  <div className="text-xs text-muted-foreground">
                    <strong>System Prompt:</strong> {config.system_prompt.substring(0, 150)}...
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};