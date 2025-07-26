import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Settings, Edit, Plus, X } from 'lucide-react';
import { Agent } from '@/types/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

interface AgentManagementProps {
  agents: Agent[];
  loading: boolean;
  onLoad: () => void;
  onUpdate: (id: string, config: Partial<Agent>) => void;
}

export const AgentManagement = ({ agents, loading, onLoad, onUpdate }: AgentManagementProps) => {
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    isActive: false,
    system_prompt: '',
    response_style: '',
    goals: [] as string[],
    agent_type: '',
    is_default: false
  });

  useEffect(() => {
    if (agents.length === 0 && !loading) {
      onLoad();
    }
  }, [agents.length, loading, onLoad]);

  const handleEditClick = (agent: Agent) => {
    setEditingAgent(agent);
    setEditForm({
      name: agent.name,
      description: agent.description,
      isActive: agent.isActive,
      system_prompt: agent.configuration?.system_prompt || '',
      response_style: agent.configuration?.response_style || '',
      goals: agent.configuration?.goals || [],
      agent_type: agent.configuration?.agent_type || '',
      is_default: agent.configuration?.is_default || false
    });
  };

  const handleToggleActive = async (agent: Agent) => {
    setUpdating(agent.id);
    try {
      await onUpdate(agent.id, { isActive: !agent.isActive });
    } finally {
      setUpdating(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingAgent) return;
    
    setUpdating(editingAgent.id);
    try {
      await onUpdate(editingAgent.id, {
        name: editForm.name,
        description: editForm.description,
        isActive: editForm.isActive,
        configuration: {
          ...editingAgent.configuration,
          system_prompt: editForm.system_prompt,
          response_style: editForm.response_style,
          goals: editForm.goals,
          agent_type: editForm.agent_type,
          is_default: editForm.is_default
        }
      });
      setEditingAgent(null);
    } finally {
      setUpdating(null);
    }
  };

  const addGoal = () => {
    setEditForm(prev => ({ ...prev, goals: [...prev.goals, ''] }));
  };

  const removeGoal = (index: number) => {
    setEditForm(prev => ({ 
      ...prev, 
      goals: prev.goals.filter((_, i) => i !== index) 
    }));
  };

  const updateGoal = (index: number, value: string) => {
    setEditForm(prev => ({
      ...prev,
      goals: prev.goals.map((goal, i) => i === index ? value : goal)
    }));
  };

  const getAgentTypeBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      'bill_agent': 'default',
      'peer_agent': 'secondary',
      'flow_agent': 'destructive'
    };
    return <Badge variant={variants[type] || 'default'}>{type}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Agent Management
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onLoad} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading && agents.length === 0 ? (
          <LoadingSpinner />
        ) : agents.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No agents found</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Total agents: {agents.length} | 
              Active: {agents.filter(agent => agent.isActive).length}
            </p>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">
                      {agent.name}
                    </TableCell>
                    <TableCell>
                      {getAgentTypeBadge(agent.configuration?.agent_type || 'unknown')}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {agent.description || 'No description'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={agent.isActive}
                          onCheckedChange={() => handleToggleActive(agent)}
                          disabled={updating === agent.id}
                        />
                        <Badge variant={agent.isActive ? 'default' : 'secondary'}>
                          {agent.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(agent.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditClick(agent)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Edit Agent Configuration</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="agent-name">Name</Label>
                              <Input
                                id="agent-name"
                                value={editForm.name}
                                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                              />
                            </div>
                            <div>
                              <Label htmlFor="agent-description">Description</Label>
                              <Textarea
                                id="agent-description"
                                value={editForm.description}
                                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                              />
                            </div>
                            <div>
                              <Label htmlFor="agent-type">Agent Type</Label>
                              <Select value={editForm.agent_type} onValueChange={(value) => setEditForm(prev => ({ ...prev, agent_type: value }))}>
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
                              <Label htmlFor="system-prompt">System Prompt</Label>
                              <Textarea
                                id="system-prompt"
                                value={editForm.system_prompt}
                                onChange={(e) => setEditForm(prev => ({ ...prev, system_prompt: e.target.value }))}
                                rows={4}
                              />
                            </div>
                            <div>
                              <Label htmlFor="response-style">Response Style</Label>
                              <Textarea
                                id="response-style"
                                value={editForm.response_style}
                                onChange={(e) => setEditForm(prev => ({ ...prev, response_style: e.target.value }))}
                                rows={2}
                              />
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <Label>Goals</Label>
                                <Button type="button" variant="outline" size="sm" onClick={addGoal}>
                                  <Plus className="h-4 w-4 mr-1" />
                                  Add Goal
                                </Button>
                              </div>
                              <div className="space-y-2">
                                {editForm.goals.map((goal, index) => (
                                  <div key={index} className="flex gap-2">
                                    <Input
                                      value={goal}
                                      onChange={(e) => updateGoal(index, e.target.value)}
                                      placeholder="Enter goal"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => removeGoal(index)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                                {editForm.goals.length === 0 && (
                                  <p className="text-sm text-muted-foreground">No goals set</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={editForm.isActive}
                                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, isActive: checked }))}
                              />
                              <Label>Active</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={editForm.is_default}
                                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_default: checked }))}
                              />
                              <Label>Default Agent</Label>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={() => setEditingAgent(null)}>
                                Cancel
                              </Button>
                              <Button onClick={handleSaveEdit} disabled={updating === editingAgent?.id}>
                                {updating === editingAgent?.id ? 'Saving...' : 'Save Changes'}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};