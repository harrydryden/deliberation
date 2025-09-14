import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Agent, FacilitatorConfig } from '@/types/index';
import { serviceContainer } from '@/services/domain/container';
import { logger } from '@/utils/logger';
import { useForm } from '@/hooks/useForm';
import { FormField } from '@/components/forms/FormField';
import { GoalsInput } from '@/components/forms/GoalsInput';

interface EditForm {
  name: string;
  description: string;
  is_active: boolean;
  character_limit: number;
  additional_response_style: string;
  goals: string[];
  agent_type: string;
  is_default: boolean;
  facilitator_config: FacilitatorConfig;
}

const getDefaultFormData = (): EditForm => ({
  name: '',
  description: '',
  is_active: false,
  character_limit: 1500,
  additional_response_style: '',
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
      share_issue_prompt: 'To build a coherent IBIS map, let me help identify the key issues that need to be considered in this discussion. What specific issues or questions should we focus on?',
      share_position_prompt: 'Now that we have identified the issues, let me help facilitate developing clear positions. What is your stance on this issue, and how would you articulate your position?',
      share_argument_prompt: 'To strengthen our IBIS map, let me help organize the arguments. What reasons support your position, and what evidence can you provide?'
    }
  }
});

export const AgentManagement: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();
  const agentService = serviceContainer.agentService;

  const createForm = useForm({
    initialData: getDefaultFormData(),
    onSubmit: async (data) => {
      // Construct response_style from character limit and additional notes
      const response_style = `Keep responses to no more than ${data.character_limit} characters.${
        data.additional_response_style ? ` ${data.additional_response_style}` : ''
      }`;
      
      const agentData = {
        ...data,
        response_style,
        max_response_characters: data.character_limit,
      };
      
      const createdAgent = await agentService.createAgent(agentData as Omit<Agent, 'id' | 'created_at'>);
      setAgents([...agents, createdAgent]);
      setIsCreateDialogOpen(false);
      createForm.resetForm();
      toast({
        title: 'Success',
        description: 'Agent created successfully',
      });
    }
  });

  const editForm = useForm({
    initialData: getDefaultFormData(),
    onSubmit: async (data) => {
      if (!editingAgent) return;
      
      // Construct response_style from character limit and additional notes
      const response_style = `Keep responses to no more than ${data.character_limit} characters.${
        data.additional_response_style ? ` ${data.additional_response_style}` : ''
      }`;
      
      const agentData = {
        ...data,
        response_style,
        max_response_characters: data.character_limit,
      };
      
      const updatedAgent = await agentService.updateAgent(editingAgent.id, agentData);
      setAgents(agents.map(a => a.id === editingAgent.id ? updatedAgent : a));
      setIsEditDialogOpen(false);
      setEditingAgent(null);
      toast({
        title: 'Success',
        description: 'Agent updated successfully',
      });
    }
  });

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
    
    // Parse existing response_style to extract character limit and additional notes
    let characterLimit = agent.max_response_characters || 1500;
    let additionalResponseStyle = '';
    
    if (agent.response_style) {
      const match = agent.response_style.match(/Keep responses to no more than (\d+) characters\.?\s*(.*)/);
      if (match) {
        characterLimit = parseInt(match[1]) || characterLimit;
        additionalResponseStyle = match[2] || '';
      } else {
        // If it doesn't match the standard format, put the whole thing in additional style
        additionalResponseStyle = agent.response_style;
      }
    }
    
    editForm.resetForm({
      name: agent.name,
      description: agent.description,
      is_active: agent.is_active,
      character_limit: characterLimit,
      additional_response_style: additionalResponseStyle,
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
          share_issue_prompt: '',
          share_position_prompt: '',
          share_argument_prompt: ''
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

  const handleCreateAgent = async () => {
    try {
      await createForm.handleSubmit();
    } catch (error) {
      logger.error('Failed to create agent', { error });
      toast({
        title: 'Error',
        description: 'Failed to create agent',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateAgent = async () => {
    try {
      await editForm.handleSubmit();
    } catch (error) {
      logger.error('Failed to update agent', { editingAgent: editingAgent?.id, error });
      toast({
        title: 'Error',
        description: 'Failed to update agent',
        variant: 'destructive',
      });
    }
  };

  const AgentForm: React.FC<{ form: ReturnType<typeof useForm<EditForm>> }> = ({ form }) => (
    <div className="space-y-4">
      <FormField
        type="input"
        label="Name"
        value={form.formData.name}
        onChange={(value) => form.updateField('name', value)}
        placeholder="Agent name"
        required
      />
      
      <FormField
        type="textarea"
        label="Description"
        value={form.formData.description}
        onChange={(value) => form.updateField('description', value)}
        placeholder="Agent description"
      />

      <FormField
        type="select"
        label="Agent Type"
        value={form.formData.agent_type}
        onChange={(value) => form.updateField('agent_type', value)}
        placeholder="Select agent type"
        options={[
          { value: 'bill_agent', label: 'Bill Agent' },
          { value: 'peer_agent', label: 'Peer Agent' },
          { value: 'flow_agent', label: 'Flow Agent' }
        ]}
        required
      />

      <FormField
        type="input"
        label="Character Limit"
        inputType="number"
        value={form.formData.character_limit.toString()}
        onChange={(value) => form.updateField('character_limit', parseInt(value) || 1500)}
        placeholder="1500"
        min="100"
        max="4000"
        helpText={
          form.formData.character_limit < 1000 
             ? " Warning: Limits below 1000 may cause blank responses from gpt-4o-mini."
             : "Recommended: 1500+ for reliable responses with gpt-4o-mini."
        }
        className={form.formData.character_limit < 1000 ? "border-orange-500" : ""}
        required
      />

      <FormField
        type="textarea"
        label="Additional Response Style Notes"
        value={form.formData.additional_response_style}
        onChange={(value) => form.updateField('additional_response_style', value)}
        placeholder="Optional: Additional style guidelines (e.g., formal tone, include examples, etc.)"
        rows={2}
      />

      {/* Response Style Preview */}
      <div className="space-y-2 p-3 bg-muted/50 rounded-md">
        <Label className="text-sm font-medium">Response Style Preview:</Label>
        <p className="text-sm text-muted-foreground">
          Keep responses to no more than {form.formData.character_limit} characters.
          {form.formData.additional_response_style ? ` ${form.formData.additional_response_style}` : ''}
        </p>
      </div>

      <GoalsInput
        goals={form.formData.goals}
        onGoalsChange={(goals) => form.updateField('goals', goals)}
      />

      <FormField
        type="switch"
        label="Active"
        checked={form.formData.is_active}
        onChange={(checked) => form.updateField('is_active', checked)}
      />

      <FormField
        type="switch"
        label="Default Agent"
        checked={form.formData.is_default}
        onChange={(checked) => form.updateField('is_default', checked)}
      />

      {/* IBIS Facilitation Prompts (Flo Only) */}
      {form.formData.agent_type === 'flow_agent' && (form.formData.name === 'Flo' || form.formData.name.toLowerCase().includes('flo')) && (
        <div className="space-y-2 border-t pt-4">
          <Label className="text-base font-semibold">IBIS Facilitation Prompts</Label>
          <p className="text-sm text-muted-foreground">
            Configure how Flo facilitates IBIS map construction and manages conversation flow
          </p>
          <div className="flex items-center space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => form.updateField('facilitator_config', {
                ...form.formData.facilitator_config,
                ibis_facilitation: {
                  ...form.formData.facilitator_config.ibis_facilitation,
                  enabled: !form.formData.facilitator_config.ibis_facilitation?.enabled
                }
              })}
              size="sm"
            >
              {form.formData.facilitator_config.ibis_facilitation?.enabled ? 'Disable' : 'Enable'} IBIS Facilitation
            </Button>
          </div>
          {form.formData.facilitator_config.ibis_facilitation?.enabled && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="global-ibis-issue">Issue Facilitation Prompt</Label>
                <Textarea
                  id="global-ibis-issue"
                  rows={2}
                  value={form.formData.facilitator_config.ibis_facilitation?.share_issue_prompt || ''}
                  onChange={(e) => form.updateField('facilitator_config', {
                    ...form.formData.facilitator_config,
                    ibis_facilitation: {
                      ...form.formData.facilitator_config.ibis_facilitation,
                      share_issue_prompt: e.target.value
                    }
                  })}
                  placeholder="How to facilitate identifying and organizing issues in the IBIS map"
                />
              </div>
              <div>
                <Label htmlFor="global-ibis-position">Position Facilitation Prompt</Label>
                <Textarea
                  id="global-ibis-position"
                  rows={2}
                  value={form.formData.facilitator_config.ibis_facilitation?.share_position_prompt || ''}
                  onChange={(e) => form.updateField('facilitator_config', {
                    ...form.formData.facilitator_config,
                    ibis_facilitation: {
                      ...form.formData.facilitator_config.ibis_facilitation,
                      share_position_prompt: e.target.value
                    }
                  })}
                  placeholder="How to facilitate developing and organizing positions in the IBIS map"
                />
              </div>
              <div>
                <Label htmlFor="global-ibis-argument">Argument Facilitation Prompt</Label>
                <Textarea
                  id="global-ibis-argument"
                  rows={2}
                  value={form.formData.facilitator_config.ibis_facilitation?.share_argument_prompt || ''}
                  onChange={(e) => form.updateField('facilitator_config', {
                    ...form.formData.facilitator_config,
                    ibis_facilitation: {
                      ...form.formData.facilitator_config.ibis_facilitation,
                      share_argument_prompt: e.target.value
                    }
                  })}
                  placeholder="How to facilitate developing and organizing arguments in the IBIS map"
                />
              </div>
            </div>
          )}
        </div>
      )}
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
                Manage global agent configurations. System prompts are now centrally managed via Prompt Templates.
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>Create Agent</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Agent</DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    Create a global agent template. System prompts are managed separately via Prompt Templates.
                  </p>
                </DialogHeader>
                <AgentForm form={createForm} />
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateAgent}
                    disabled={createForm.isSubmitting}
                  >
                    {createForm.isSubmitting ? 'Creating...' : 'Create Agent'}
                  </Button>
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Agent</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Update agent configuration. System prompts are managed via Prompt Templates.
          </p>
        </DialogHeader>
          <AgentForm form={editForm} />
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateAgent}
              disabled={editForm.isSubmitting}
            >
              {editForm.isSubmitting ? 'Updating...' : 'Update Agent'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};