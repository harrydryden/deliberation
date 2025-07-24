import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Save, RotateCcw, Eye, EyeOff } from "lucide-react";
import { AgentConfigPreview } from "./AgentConfigPreview";

type AgentConfig = {
  id: string;
  agent_type: string;
  name: string;
  description?: string;
  system_prompt: string;
  goals?: string[];
  response_style?: string;
  is_default: boolean;
  is_active: boolean;
};

export const AgentConfigManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<string>("bill_agent");
  const [editingConfig, setEditingConfig] = useState<AgentConfig | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const { data: configs, isLoading } = useQuery({
    queryKey: ["agent-configurations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_configurations")
        .select("*")
        .eq("is_default", true)
        .order("agent_type");
      
      if (error) throw error;
      return data as AgentConfig[];
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (config: AgentConfig) => {
      const { error } = await supabase
        .from("agent_configurations")
        .update({
          name: config.name,
          description: config.description,
          system_prompt: config.system_prompt,
          goals: config.goals,
          response_style: config.response_style,
        })
        .eq("id", config.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-configurations"] });
      setEditingConfig(null);
      toast({
        title: "Configuration Updated",
        description: "Agent configuration has been successfully updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: `Failed to update configuration: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const currentConfig = configs?.find(c => c.agent_type === selectedAgent);

  useEffect(() => {
    if (currentConfig) {
      setEditingConfig({ ...currentConfig });
    }
  }, [currentConfig]);

  const handleSave = () => {
    if (editingConfig) {
      updateConfigMutation.mutate(editingConfig);
    }
  };

  const handleReset = () => {
    if (currentConfig) {
      setEditingConfig({ ...currentConfig });
    }
  };

  const handleGoalChange = (index: number, value: string) => {
    if (!editingConfig) return;
    const newGoals = [...(editingConfig.goals || [])];
    newGoals[index] = value;
    setEditingConfig({ ...editingConfig, goals: newGoals });
  };

  const addGoal = () => {
    if (!editingConfig) return;
    setEditingConfig({
      ...editingConfig,
      goals: [...(editingConfig.goals || []), ""]
    });
  };

  const removeGoal = (index: number) => {
    if (!editingConfig) return;
    const newGoals = editingConfig.goals?.filter((_, i) => i !== index) || [];
    setEditingConfig({ ...editingConfig, goals: newGoals });
  };

  if (isLoading) {
    return <div>Loading configurations...</div>;
  }

  const agentTypes = [
    { value: "bill_agent", label: "Bill Agent", description: "IBIS structure facilitator" },
    { value: "peer_agent", label: "Peer Agent", description: "Peer interaction facilitator" },
    { value: "flow_agent", label: "Flow Agent", description: "Discussion flow manager" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Tabs value={selectedAgent} onValueChange={setSelectedAgent} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            {agentTypes.map((agent) => (
              <TabsTrigger key={agent.value} value={agent.value} className="flex flex-col gap-1">
                <span className="font-medium">{agent.label}</span>
                <span className="text-xs text-muted-foreground">{agent.description}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {editingConfig && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Edit Configuration</CardTitle>
                <div className="flex gap-2 mt-2">
                  <Badge variant={editingConfig.is_active ? "default" : "secondary"}>
                    {editingConfig.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Badge variant={editingConfig.is_default ? "outline" : "secondary"}>
                    {editingConfig.is_default ? "Default" : "Custom"}
                  </Badge>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showPreview ? "Hide" : "Show"} Preview
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={editingConfig.name}
                  onChange={(e) => setEditingConfig({ ...editingConfig, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={editingConfig.description || ""}
                  onChange={(e) => setEditingConfig({ ...editingConfig, description: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="system_prompt">System Prompt</Label>
                <Textarea
                  id="system_prompt"
                  rows={8}
                  value={editingConfig.system_prompt}
                  onChange={(e) => setEditingConfig({ ...editingConfig, system_prompt: e.target.value })}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label>Goals</Label>
                {(editingConfig.goals || []).map((goal, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={goal}
                      onChange={(e) => handleGoalChange(index, e.target.value)}
                      placeholder={`Goal ${index + 1}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeGoal(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addGoal}>
                  Add Goal
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="response_style">Response Style</Label>
                <Textarea
                  id="response_style"
                  rows={4}
                  value={editingConfig.response_style || ""}
                  onChange={(e) => setEditingConfig({ ...editingConfig, response_style: e.target.value })}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} disabled={updateConfigMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          {showPreview && (
            <AgentConfigPreview config={editingConfig} />
          )}
        </div>
      )}
    </div>
  );
};