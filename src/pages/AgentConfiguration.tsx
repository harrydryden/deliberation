import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Settings, Copy, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface AgentConfiguration {
  id: string;
  agent_type: 'bill_agent' | 'peer_agent' | 'flow_agent';
  name: string;
  description: string;
  system_prompt: string;
  goals: string[];
  response_style: string;
  is_active: boolean;
  is_default: boolean;
  created_by?: string;
  deliberation_id?: string;
  created_at: string;
  updated_at: string;
}

export default function AgentConfiguration() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [configurations, setConfigurations] = useState<AgentConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<'bill_agent' | 'peer_agent' | 'flow_agent'>('bill_agent');
  const [editingConfig, setEditingConfig] = useState<AgentConfiguration | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    system_prompt: '',
    goals: '',
    response_style: '',
    is_active: false
  });

  useEffect(() => {
    fetchConfigurations();
  }, []);

  const fetchConfigurations = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_configurations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConfigurations((data as AgentConfiguration[]) || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch agent configurations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const configData = {
        agent_type: selectedType,
        name: formData.name,
        description: formData.description,
        system_prompt: formData.system_prompt,
        goals: formData.goals.split('\n').filter(g => g.trim()),
        response_style: formData.response_style,
        is_active: formData.is_active,
        created_by: user.id,
        is_default: false
      };

      if (editingConfig) {
        const { error } = await supabase
          .from('agent_configurations')
          .update(configData)
          .eq('id', editingConfig.id);
        
        if (error) throw error;
        toast({ title: "Success", description: "Configuration updated successfully" });
      } else {
        const { error } = await supabase
          .from('agent_configurations')
          .insert(configData);
        
        if (error) throw error;
        toast({ title: "Success", description: "Configuration created successfully" });
      }

      setIsDialogOpen(false);
      setEditingConfig(null);
      resetForm();
      fetchConfigurations();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (config: AgentConfiguration) => {
    setEditingConfig(config);
    setSelectedType(config.agent_type);
    setFormData({
      name: config.name,
      description: config.description || '',
      system_prompt: config.system_prompt,
      goals: config.goals?.join('\n') || '',
      response_style: config.response_style || '',
      is_active: config.is_active
    });
    setIsDialogOpen(true);
  };

  const handleDuplicate = async (config: AgentConfiguration) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('agent_configurations')
        .insert({
          agent_type: config.agent_type,
          name: `${config.name} (Copy)`,
          description: config.description,
          system_prompt: config.system_prompt,
          goals: config.goals,
          response_style: config.response_style,
          is_active: false,
          is_default: false,
          created_by: user.id
        });

      if (error) throw error;
      toast({ title: "Success", description: "Configuration duplicated successfully" });
      fetchConfigurations();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to duplicate configuration",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (configId: string) => {
    try {
      const { error } = await supabase
        .from('agent_configurations')
        .delete()
        .eq('id', configId);

      if (error) throw error;
      toast({ title: "Success", description: "Configuration deleted successfully" });
      fetchConfigurations();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete configuration",
        variant: "destructive"
      });
    }
  };

  const toggleActive = async (configId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('agent_configurations')
        .update({ is_active: !currentActive })
        .eq('id', configId);

      if (error) throw error;
      fetchConfigurations();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update configuration",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      system_prompt: '',
      goals: '',
      response_style: '',
      is_active: false
    });
  };

  const getAgentTypeConfigs = (type: string) => 
    configurations.filter(config => config.agent_type === type);

  const agentTypeLabels = {
    bill_agent: 'Bill Agent',
    peer_agent: 'Peer Agent',
    flow_agent: 'Flow Agent'
  };

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Agent Configuration</h1>
            <p className="text-muted-foreground mt-2">
              Customize AI agent behaviors and instructions for your deliberations
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingConfig(null); resetForm(); }}>
                <Plus className="w-4 h-4 mr-2" />
                New Configuration
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingConfig ? 'Edit Configuration' : 'Create New Configuration'}
                </DialogTitle>
                <DialogDescription>
                  Define how your AI agent should behave and respond in deliberations
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agent_type">Agent Type</Label>
                  <Select value={selectedType} onValueChange={(value: any) => setSelectedType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bill_agent">Bill Agent</SelectItem>
                      <SelectItem value="peer_agent">Peer Agent</SelectItem>
                      <SelectItem value="flow_agent">Flow Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Socratic Bill Agent"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this configuration"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="system_prompt">System Prompt</Label>
                  <Textarea
                    id="system_prompt"
                    value={formData.system_prompt}
                    onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                    placeholder="Define the agent's role, behavior, and instructions..."
                    className="min-h-[200px]"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="goals">Goals (one per line)</Label>
                  <Textarea
                    id="goals"
                    value={formData.goals}
                    onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                    placeholder="Structure discussions using IBIS framework&#10;Identify key issues and positions&#10;Encourage deeper analysis"
                    className="min-h-[100px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="response_style">Response Style</Label>
                  <Textarea
                    id="response_style"
                    value={formData.response_style}
                    onChange={(e) => setFormData({ ...formData, response_style: e.target.value })}
                    placeholder="Describe the tone, length, and style of responses..."
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active Configuration</Label>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" className="flex-1">
                    {editingConfig ? 'Update' : 'Create'} Configuration
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="bill_agent" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="bill_agent">Bill Agent</TabsTrigger>
            <TabsTrigger value="peer_agent">Peer Agent</TabsTrigger>
            <TabsTrigger value="flow_agent">Flow Agent</TabsTrigger>
          </TabsList>

          {(['bill_agent', 'peer_agent', 'flow_agent'] as const).map((agentType) => (
            <TabsContent key={agentType} value={agentType} className="space-y-4">
              <div className="grid gap-4">
                {getAgentTypeConfigs(agentType).map((config) => (
                  <Card key={config.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {config.name}
                            {config.is_default && <Badge variant="secondary">Default</Badge>}
                            {config.is_active && <Badge variant="default">Active</Badge>}
                          </CardTitle>
                          <CardDescription>{config.description}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={config.is_active}
                            onCheckedChange={() => toggleActive(config.id, config.is_active)}
                            disabled={config.is_default}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(config)}
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDuplicate(config)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          {!config.is_default && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(config.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium mb-2">Goals</h4>
                          <div className="flex flex-wrap gap-1">
                            {config.goals?.map((goal, index) => (
                              <Badge key={index} variant="outline">{goal}</Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-medium mb-2">Response Style</h4>
                          <p className="text-sm text-muted-foreground">{config.response_style}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-2">System Prompt</h4>
                          <p className="text-sm text-muted-foreground line-clamp-3">{config.system_prompt}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {getAgentTypeConfigs(agentType).length === 0 && (
                  <Card>
                    <CardContent className="flex items-center justify-center py-12">
                      <div className="text-center space-y-2">
                        <p className="text-muted-foreground">No configurations for {agentTypeLabels[agentType]}</p>
                        <Button variant="outline" onClick={() => { setSelectedType(agentType); setIsDialogOpen(true); }}>
                          Create First Configuration
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Layout>
  );
}