import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Agent, FacilitatorConfig } from '@/types/api';
import { useServices } from '@/hooks/useServices';
import { logger } from '@/utils/logger';
import { usePromptService } from '@/hooks/useServices';

interface EditForm {
  name: string;
  description: string;
  is_active: boolean;
  response_style: string;
  goals: string[];
  agent_type: string;
  is_default: boolean;
  facilitator_config: FacilitatorConfig;
}

export const AgentManagement: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    description: '',
    is_active: false,
    response_style: '',
    goals: [] as string[],
    agent_type: '',
    is_default: false,
      facilitator_config: {
        prompting_enabled: false,
        prompting_interval_minutes: 3,
        max_prompts_per_session: 5,
        prompting_questions: [],
        ibis_facilitation: {
          enabled: false,
          elicit_issue_prompt: '',
          elicit_position_prompt: '',
          elicit_argument_prompt: ''
        }
      }
  });
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();
  const { agentService } = useServices();
  const { promptService } = useServices();

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const fetchedAgents = await agentService.getGlobalAgents();
      setAgents(fetchedAgents);
    } catch (error) {
      logger.error('Failed to fetch agents', { error });
      toast({
        title: 'Error',
        description: 'Failed to load agents',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setEditForm({
      name: agent.name,
      description: agent.description,
      is_active: agent.is_active,
      response_style: agent.response_style || '',
      goals: agent.goals || [],
      agent_type: agent.agent_type || '',
      is_default: agent.is_default || false,
      facilitator_config: agent.facilitator_config || {
        prompting_enabled: false,
        prompting_interval_minutes: 3,
        max_prompts_per_session: 5,
        prompting_questions: [],
        ibis_facilitation: {
          enabled: false,
          elicit_issue_prompt: '',
          elicit_position_prompt: '',
          elicit_argument_prompt: ''
        }
      }
    });
    setIsEditDialogOpen(true);
  };

  const handleToggleActive = async (agent: Agent) => {
    try {
      const updatedAgent = await agentService.updateAgent(agent.id, {
        is_active: !agent.is_active
      });
      setAgents(agents.map(a => a.id === agent.id ? updatedAgent : a));
      toast({
        title: 'Success',
        description: `Agent ${updatedAgent.is_active ? 'activated' : 'deactivated'}`,
      });
    } catch (error) {
      logger.error('Failed to toggle agent status', { agentId: agent.id, error });
      toast({
        title: 'Error',
        description: 'Failed to update agent status',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateAgent = async () => {
    if (!editingAgent) return;
    
    try {
      const updatedAgent = await agentService.updateAgent(editingAgent.id, {
        is_active: editForm.is_active,
        name: editForm.name,
        description: editForm.description,
        response_style: editForm.response_style,
        goals: editForm.goals,
        agent_type: editForm.agent_type,
        is_default: editForm.is_default,
        facilitator_config: editForm.facilitator_config,
      });

      setAgents(agents.map(a => a.id === editingAgent.id ? updatedAgent : a));
      setIsEditDialogOpen(false);
      setEditingAgent(null);
      
      toast({
        title: 'Success',
        description: 'Agent updated successfully',
      });
    } catch (error) {
      logger.error('Failed to update agent', { agentId: editingAgent.id, error });
      toast({
        title: 'Error',
        description: 'Failed to update agent',
        variant: 'destructive',
      });
    }
  };

  const handleCreateAgent = async () => {
    try {
      const createdAgent = await agentService.createAgent({
        name: editForm.name,
        description: editForm.description,
        is_active: editForm.is_active,
        response_style: editForm.response_style,
        goals: editForm.goals,
        agent_type: editForm.agent_type,
        is_default: editForm.is_default,
        facilitator_config: editForm.facilitator_config,
      } as Omit<Agent, 'id' | 'created_at' | 'updated_at'>);

      setAgents([...agents, createdAgent]);
      setIsCreateDialogOpen(false);
      
      // Reset form
      setEditForm({
        name: '',
        description: '',
        is_active: false,
        response_style: '',
        goals: [],
        agent_type: '',
        is_default: false,
        facilitator_config: {
          prompting_enabled: false,
          prompting_interval_minutes: 3,
          max_prompts_per_session: 5,
          prompting_questions: [],
          ibis_facilitation: {
            enabled: false,
            elicit_issue_prompt: '',
            elicit_position_prompt: '',
            elicit_argument_prompt: ''
          }
        }
      });
      
      toast({
        title: 'Success',
        description: 'Agent created successfully',
      });
    } catch (error) {
      logger.error('Failed to create agent', { error });
      toast({
        title: 'Error',
        description: 'Failed to create agent',
        variant: 'destructive',
      });
    }
  };

  const AgentForm: React.FC<{ isEdit: boolean }> = ({ isEdit }) => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={editForm.name}
          onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Agent name"
        />
      </div>
      
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={editForm.description}
          onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Agent description"
        />
      </div>

      <div>
        <Label htmlFor="agent_type">Agent Type</Label>
        <Select
          value={editForm.agent_type}
          onValueChange={(value) => setEditForm(prev => ({ ...prev, agent_type: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select agent type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bill_agent">Bill Agent</SelectItem>
            <SelectItem value="peer_agent">Peer Agent</SelectItem>
            <SelectItem value="flow_agent">Flow Agent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="response_style">Response Style</Label>
        <Textarea
          id="response_style"
          value={editForm.response_style}
          onChange={(e) => setEditForm(prev => ({ ...prev, response_style: e.target.value }))}
          placeholder="Response style guidelines"
        />
      </div>

      <div>
        <Label htmlFor="goals">Goals (comma-separated)</Label>
        <Textarea
          id="goals"
          value={editForm.goals.join(', ')}
          onChange={(e) => setEditForm(prev => ({ 
            ...prev, 
            goals: e.target.value.split(',').map(goal => goal.trim()).filter(goal => goal.length > 0)
          }))}
          placeholder="Agent goals, separated by commas"
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="is_active"
          checked={editForm.is_active}
          onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_active: checked }))}
        />
        <Label htmlFor="is_active">Active</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="is_default"
          checked={editForm.is_default}
          onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_default: checked }))}
        />
        <Label htmlFor="is_default">Default Agent</Label>
      </div>
    </div>
  );

  if (loading) {
    return <div>Loading agents...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Agent Management</CardTitle>
              <CardDescription>
                Manage global agent configurations (system prompts are now managed via Prompt Templates)
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>Create Agent</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Agent</DialogTitle>
                </DialogHeader>
                <AgentForm isEdit={false} />
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateAgent}>Create Agent</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell className="font-medium">{agent.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{agent.agent_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={agent.is_active}
                      onCheckedChange={() => handleToggleActive(agent)}
                    />
                  </TableCell>
                  <TableCell>
                    {agent.is_default ? (
                      <Badge variant="default">Yes</Badge>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(agent.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditAgent(agent)}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
          </DialogHeader>
          <AgentForm isEdit={true} />
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateAgent}>Update Agent</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};