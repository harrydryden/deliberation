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
import { RefreshCw, Settings, Edit, Plus, X, UserPlus } from 'lucide-react';
import { formatToUKDate } from '@/utils/timeUtils';
import { Agent, FacilitatorConfig, FacilitatorQuestion } from '@/types/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

interface AgentManagementProps {
  agents: Agent[];
  loading: boolean;
  onLoad: () => void;
  onUpdate: (id: string, config: Partial<Agent>) => void;
  onCreate?: (config: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export const AgentManagement = ({ agents, loading, onLoad, onUpdate, onCreate }: AgentManagementProps) => {
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    isActive: false,
    system_prompt: '',
    response_style: '',
    goals: [] as string[],
    agent_type: '',
    is_default: false,
    facilitator_config: {
      prompting_enabled: false,
      prompting_interval_minutes: 3,
      max_prompts_per_session: 5,
      prompting_questions: [] as FacilitatorQuestion[]
    } as FacilitatorConfig
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
      system_prompt: agent.system_prompt || '',
      response_style: agent.response_style || '',
      goals: agent.goals || [],
      agent_type: agent.agent_type || '',
      is_default: agent.is_default || false,
      facilitator_config: agent.facilitator_config || {
        prompting_enabled: false,
        prompting_interval_minutes: 3,
        max_prompts_per_session: 5,
        prompting_questions: []
      }
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
        system_prompt: editForm.system_prompt,
        response_style: editForm.response_style,
        goals: editForm.goals,
        agent_type: editForm.agent_type,
        is_default: editForm.is_default,
        facilitator_config: editForm.facilitator_config
      });
      setEditingAgent(null);
    } finally {
      setUpdating(null);
    }
  };

  const handleCreateAgent = () => {
    setCreating(true);
    setEditForm({
      name: '',
      description: '',
      isActive: true,
      system_prompt: '',
      response_style: '',
      goals: [],
      agent_type: 'bill_agent',
      is_default: true, // New agents are global templates by default
      facilitator_config: {
        prompting_enabled: false,
        prompting_interval_minutes: 3,
        max_prompts_per_session: 5,
        prompting_questions: []
      }
    });
  };

  const handleSaveNewAgent = async () => {
    if (!onCreate) return;
    
    setUpdating('creating');
    try {
      await onCreate({
        name: editForm.name,
        description: editForm.description,
        isActive: editForm.isActive,
        system_prompt: editForm.system_prompt,
        response_style: editForm.response_style,
        goals: editForm.goals,
        agent_type: editForm.agent_type,
        is_default: editForm.is_default,
        facilitator_config: editForm.facilitator_config
      } as Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>);
      setCreating(false);
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

  // Facilitator question management
  const addFacilitatorQuestion = () => {
    const newQuestion: FacilitatorQuestion = {
      id: `question_${Date.now()}`,
      text: '',
      category: 'exploration',
      weight: 1.0
    };
    setEditForm(prev => ({
      ...prev,
      facilitator_config: {
        ...prev.facilitator_config,
        prompting_questions: [...prev.facilitator_config.prompting_questions, newQuestion]
      }
    }));
  };

  const removeFacilitatorQuestion = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      facilitator_config: {
        ...prev.facilitator_config,
        prompting_questions: prev.facilitator_config.prompting_questions.filter((_, i) => i !== index)
      }
    }));
  };

  const updateFacilitatorQuestion = (index: number, field: keyof FacilitatorQuestion, value: any) => {
    setEditForm(prev => ({
      ...prev,
      facilitator_config: {
        ...prev.facilitator_config,
        prompting_questions: prev.facilitator_config.prompting_questions.map((q, i) => 
          i === index ? { ...q, [field]: value } : q
        )
      }
    }));
  };

  const updateFacilitatorConfig = (field: keyof FacilitatorConfig, value: any) => {
    setEditForm(prev => ({
      ...prev,
      facilitator_config: {
        ...prev.facilitator_config,
        [field]: value
      }
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
        <div className="flex gap-2">
          {onCreate && (
            <Dialog open={creating} onOpenChange={setCreating}>
              <DialogTrigger asChild>
                <Button variant="default" size="sm" onClick={handleCreateAgent}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create Agent
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Create New Agent Template</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 overflow-y-auto flex-1 px-1">
                  {/* Same form fields as edit, but we'll create a reusable component later */}
                  <div>
                    <Label htmlFor="new-agent-name">Name</Label>
                    <Input
                      id="new-agent-name"
                      value={editForm.name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter agent name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-agent-description">Description</Label>
                    <Textarea
                      id="new-agent-description"
                      value={editForm.description}
                      onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe what this agent does"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-agent-type">Agent Type</Label>
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
                    <Label htmlFor="new-system-prompt">System Prompt</Label>
                    <Textarea
                      id="new-system-prompt"
                      value={editForm.system_prompt}
                      onChange={(e) => setEditForm(prev => ({ ...prev, system_prompt: e.target.value }))}
                      rows={4}
                      placeholder="Define how this agent should behave..."
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={editForm.is_default}
                      onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_default: checked }))}
                    />
                    <Label>Make this a global template (recommended)</Label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => setCreating(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSaveNewAgent} 
                    disabled={updating === 'creating' || !editForm.name || !editForm.agent_type}
                  >
                    {updating === 'creating' ? 'Creating...' : 'Create Agent'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Button variant="outline" size="sm" onClick={onLoad} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
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
                      {getAgentTypeBadge(agent.agent_type || 'unknown')}
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
                      {formatToUKDate(agent.createdAt)}
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
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                          <DialogHeader>
                            <DialogTitle>Edit Agent Configuration</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 overflow-y-auto flex-1 px-1">
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
                              <Label htmlFor="system-prompt">System Prompt (Agent Instructions)</Label>
                              <Textarea
                                id="system-prompt"
                                value={editForm.system_prompt}
                                onChange={(e) => setEditForm(prev => ({ ...prev, system_prompt: e.target.value }))}
                                rows={4}
                                placeholder="Enter the system prompt that defines how this agent should behave..."
                              />
                            </div>
                            <div>
                              <Label htmlFor="response-style">Response Style</Label>
                              <Textarea
                                id="response-style"
                                value={editForm.response_style}
                                onChange={(e) => setEditForm(prev => ({ ...prev, response_style: e.target.value }))}
                                rows={2}
                                placeholder="Describe the tone and style of responses..."
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
                            
                            {/* Facilitator Configuration for Flow Agent */}
                            {editForm.agent_type === 'flow_agent' && (
                              <div className="border-t pt-4">
                                <Label className="text-base font-semibold">Facilitator Configuration</Label>
                                <div className="space-y-4 mt-4">
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      checked={editForm.facilitator_config.prompting_enabled}
                                      onCheckedChange={(checked) => updateFacilitatorConfig('prompting_enabled', checked)}
                                    />
                                    <Label>Enable Facilitator Prompting</Label>
                                  </div>
                                  
                                  {editForm.facilitator_config.prompting_enabled && (
                                    <>
                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <Label htmlFor="prompt-interval">Prompting Interval (minutes)</Label>
                                          <Input
                                            id="prompt-interval"
                                            type="number"
                                            value={editForm.facilitator_config.prompting_interval_minutes}
                                            onChange={(e) => updateFacilitatorConfig('prompting_interval_minutes', parseInt(e.target.value) || 3)}
                                            min="1"
                                            max="60"
                                          />
                                        </div>
                                        <div>
                                          <Label htmlFor="max-prompts">Max Prompts per Session</Label>
                                          <Input
                                            id="max-prompts"
                                            type="number"
                                            value={editForm.facilitator_config.max_prompts_per_session}
                                            onChange={(e) => updateFacilitatorConfig('max_prompts_per_session', parseInt(e.target.value) || 5)}
                                            min="1"
                                            max="20"
                                          />
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className="flex items-center justify-between mb-2">
                                          <Label>Facilitator Questions</Label>
                                          <Button type="button" variant="outline" size="sm" onClick={addFacilitatorQuestion}>
                                            <Plus className="h-4 w-4 mr-1" />
                                            Add Question
                                          </Button>
                                        </div>
                                        <div className="space-y-3 max-h-48 overflow-y-auto">
                                          {editForm.facilitator_config.prompting_questions.map((question, index) => (
                                            <div key={question.id} className="border rounded-lg p-3 space-y-2">
                                              <div className="flex gap-2">
                                                <div className="flex-1">
                                                  <Label htmlFor={`question-text-${index}`}>Question Text</Label>
                                                  <Textarea
                                                    id={`question-text-${index}`}
                                                    value={question.text}
                                                    onChange={(e) => updateFacilitatorQuestion(index, 'text', e.target.value)}
                                                    placeholder="Enter facilitator question..."
                                                    rows={2}
                                                  />
                                                </div>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => removeFacilitatorQuestion(index)}
                                                  className="mt-auto"
                                                >
                                                  <X className="h-4 w-4" />
                                                </Button>
                                              </div>
                                              <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                  <Label htmlFor={`question-category-${index}`}>Category</Label>
                                                  <Select 
                                                    value={question.category} 
                                                    onValueChange={(value) => updateFacilitatorQuestion(index, 'category', value)}
                                                  >
                                                    <SelectTrigger>
                                                      <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      <SelectItem value="exploration">Exploration</SelectItem>
                                                      <SelectItem value="perspective">Perspective</SelectItem>
                                                      <SelectItem value="clarification">Clarification</SelectItem>
                                                      <SelectItem value="synthesis">Synthesis</SelectItem>
                                                      <SelectItem value="action">Action</SelectItem>
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                <div>
                                                  <Label htmlFor={`question-weight-${index}`}>Weight</Label>
                                                  <Input
                                                    id={`question-weight-${index}`}
                                                    type="number"
                                                    value={question.weight}
                                                    onChange={(e) => updateFacilitatorQuestion(index, 'weight', parseFloat(e.target.value) || 1.0)}
                                                    min="0.1"
                                                    max="2.0"
                                                    step="0.1"
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                          {editForm.facilitator_config.prompting_questions.length === 0 && (
                                            <p className="text-sm text-muted-foreground">No facilitator questions configured</p>
                                          )}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                            
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
                          </div>
                          <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button variant="outline" onClick={() => setEditingAgent(null)}>
                              Cancel
                            </Button>
                            <Button onClick={handleSaveEdit} disabled={updating === editingAgent?.id}>
                              {updating === editingAgent?.id ? 'Saving...' : 'Save Changes'}
                            </Button>
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