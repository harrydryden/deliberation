import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Edit } from 'lucide-react';
import { Agent, FacilitatorConfig } from '@/types/index';
import { useForm } from '@/hooks/useForm';
import { FormField } from '@/components/forms/FormField';
import { GoalsInput } from '@/components/forms/GoalsInput';

interface LocalAgentEditModalProps {
  agent: Agent;
  onUpdateAgent: (id: string, config: Partial<Agent>) => void;
  loading?: boolean;
}

export const LocalAgentEditModal = ({ agent, onUpdateAgent, loading }: LocalAgentEditModalProps) => {
  const [open, setOpen] = useState(false);

  type LocalAgentForm = {
    name: string;
    description: string;
    response_style: string;
    goals: string[];
    facilitator_config: FacilitatorConfig;
    prompt_overrides: Record<string, string>;
  };

  const form = useForm<LocalAgentForm>({
    initialData: {
      name: agent.name,
      description: agent.description || '',
      response_style: agent.response_style || '',
      goals: agent.goals || [],
      prompt_overrides: agent.prompt_overrides || {},
      facilitator_config: agent.facilitator_config || {
        prompting_enabled: false,
        prompting_interval_minutes: 3,
        max_prompts_per_session: 5,
        prompting_questions: [],
        ibis_facilitation: {
          enabled: true,
          share_issue_prompt: 'Based on the existing discussion, here are the key issues other participants have identified. Which of these resonates with your perspective?',
          share_position_prompt: 'Other participants have taken various positions on this issue. Here are the main viewpoints that have been shared. Do any of these align with your thinking?',
          share_argument_prompt: 'Here are the arguments other participants have made supporting different positions. Which of these do you find most compelling, or would you like to hear more about any particular argument?'
        }
      }
    },
    onSubmit: async (data) => {
      onUpdateAgent(agent.id, {
        name: data.name,
        description: data.description,
        response_style: data.response_style,
        goals: data.goals,
        prompt_overrides: data.prompt_overrides,
        facilitator_config: data.facilitator_config,
      });
      setOpen(false);
    }
  });

  // Reset form data when agent changes or modal opens
  useEffect(() => {
    if (open) {
      form.resetForm({
        name: agent.name,
        description: agent.description || '',
        response_style: agent.response_style || '',
        goals: agent.goals || [],
        prompt_overrides: agent.prompt_overrides || {},
        facilitator_config: agent.facilitator_config || {
          prompting_enabled: false,
          prompting_interval_minutes: 3,
          max_prompts_per_session: 5,
          prompting_questions: [],
          ibis_facilitation: {
            enabled: true,
            share_issue_prompt: 'Based on the existing discussion, here are the key issues other participants have identified. Which of these resonates with your perspective?',
            share_position_prompt: 'Other participants have taken various positions on this issue. Here are the main viewpoints that have been shared. Do any of these align with your thinking?',
            share_argument_prompt: 'Here are the arguments other participants have made supporting different positions. Which of these do you find most compelling, or would you like to hear more about any particular argument?'
          }
        }
      });
    }
  }, [agent, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await form.handleSubmit(e);
  };

  const toggleIbisFacilitation = () => {
    form.updateField('facilitator_config', {
      ...form.formData.facilitator_config,
      ibis_facilitation: {
        enabled: !form.formData.facilitator_config.ibis_facilitation?.enabled,
        share_issue_prompt: form.formData.facilitator_config.ibis_facilitation?.share_issue_prompt || 'Based on the existing discussion, here are the key issues other participants have identified. Which of these resonates with your perspective?',
        share_position_prompt: form.formData.facilitator_config.ibis_facilitation?.share_position_prompt || 'Other participants have taken various positions on this issue. Here are the main viewpoints that have been shared. Do any of these align with your thinking?',
        share_argument_prompt: form.formData.facilitator_config.ibis_facilitation?.share_argument_prompt || 'Here are the arguments other participants have made supporting different positions. Which of these do you find most compelling, or would you like to hear more about any particular argument?'
      }
    });
  };

  const updateIbisPrompt = (field: 'share_issue_prompt' | 'share_position_prompt' | 'share_argument_prompt', value: string) => {
    form.updateField('facilitator_config', {
      ...form.formData.facilitator_config,
      ibis_facilitation: {
        ...(form.formData.facilitator_config.ibis_facilitation || { enabled: true, share_issue_prompt: '', share_position_prompt: '', share_argument_prompt: '' }),
        [field]: value
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Local Agent</DialogTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{agent.agent_type.replace('_', ' ')}</Badge>
            {agent.deliberation && (
              <Badge variant="secondary">{agent.deliberation.title}</Badge>
            )}
          </div>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            type="input"
            label="Agent Name"
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
            placeholder="Brief description of this agent's purpose"
            rows={2}
          />

          <FormField
            type="input"
            label="Response Style"
            value={form.formData.response_style}
            onChange={(value) => form.updateField('response_style', value)}
            placeholder="e.g., formal, casual, analytical"
          />

          <GoalsInput
            goals={form.formData.goals}
            onGoalsChange={(goals) => form.updateField('goals', goals)}
          />

          {/* System Prompt Override */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">System Prompt Override</Label>
                <p className="text-sm text-muted-foreground">
                  Override the default system prompt for this specific agent
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Template: {agent.agent_type} default
              </Badge>
            </div>

            <div className="space-y-2">
              <FormField
                type="textarea"
                label="Custom System Prompt"
                value={form.formData.prompt_overrides.system_prompt || ''}
                onChange={(value) => form.updateField('prompt_overrides', {
                  ...form.formData.prompt_overrides,
                  system_prompt: value
                })}
                placeholder="Leave empty to use template default, or enter custom system prompt..."
                rows={8}
              />
              {form.formData.prompt_overrides.system_prompt && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => form.updateField('prompt_overrides', {
                      ...form.formData.prompt_overrides,
                      system_prompt: ''
                    })}
                  >
                    Clear Override
                  </Button>
                </div>
              )}
            </div>
          </div>


          {/* IBIS Facilitation Prompts (Pia Only) */}
          {agent.agent_type === 'peer_agent' && (agent.name === 'Pia' || agent.name.toLowerCase().includes('pia')) && (
            <div className="space-y-2 border-t pt-4">
              <Label className="text-base font-semibold">IBIS Sharing Prompts</Label>
              <p className="text-sm text-muted-foreground">
                Configure how Pia shares existing participant perspectives from the IBIS map
              </p>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={toggleIbisFacilitation}
                  size="sm"
                >
                  {form.formData.facilitator_config.ibis_facilitation?.enabled ? 'Disable' : 'Enable'} IBIS Sharing
                </Button>
              </div>
              {form.formData.facilitator_config.ibis_facilitation?.enabled && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="ibis-issue">Issue Sharing Prompt</Label>
                    <Textarea
                      id="ibis-issue"
                      rows={2}
                      value={form.formData.facilitator_config.ibis_facilitation?.share_issue_prompt || ''}
                      onChange={(e) => updateIbisPrompt('share_issue_prompt', e.target.value)}
                      placeholder="How to share existing issues from other participants"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ibis-position">Position Sharing Prompt</Label>
                    <Textarea
                      id="ibis-position"
                      rows={2}
                      value={form.formData.facilitator_config.ibis_facilitation?.share_position_prompt || ''}
                      onChange={(e) => updateIbisPrompt('share_position_prompt', e.target.value)}
                      placeholder="How to share existing positions from other participants"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ibis-argument">Argument Sharing Prompt</Label>
                    <Textarea
                      id="ibis-argument"
                      rows={2}
                      value={form.formData.facilitator_config.ibis_facilitation?.share_argument_prompt || ''}
                      onChange={(e) => updateIbisPrompt('share_argument_prompt', e.target.value)}
                      placeholder="How to share existing arguments from other participants"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button 
              type="submit" 
              disabled={loading || form.isSubmitting}
            >
              {(loading || form.isSubmitting) ? 'Updating...' : 'Update Agent'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};