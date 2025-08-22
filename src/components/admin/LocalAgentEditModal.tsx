import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Edit } from 'lucide-react';
import { Agent, FacilitatorConfig } from '@/types/api';
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
          elicit_issue_prompt: 'To build a coherent IBIS map, could you share 1–2 concise issues we should consider?',
          elicit_position_prompt: 'What is your position on this issue (one sentence, actionable)?',
          elicit_argument_prompt: 'Please provide 1–2 arguments supporting your position, with any evidence or sources.'
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
            elicit_issue_prompt: 'To build a coherent IBIS map, could you share 1–2 concise issues we should consider?',
            elicit_position_prompt: 'What is your position on this issue (one sentence, actionable)?',
            elicit_argument_prompt: 'Please provide 1–2 arguments supporting your position, with any evidence or sources.'
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
        elicit_issue_prompt: form.formData.facilitator_config.ibis_facilitation?.elicit_issue_prompt || 'To build a coherent IBIS map, could you share 1–2 concise issues we should consider?',
        elicit_position_prompt: form.formData.facilitator_config.ibis_facilitation?.elicit_position_prompt || 'What is your position on this issue (one sentence, actionable)?',
        elicit_argument_prompt: form.formData.facilitator_config.ibis_facilitation?.elicit_argument_prompt || 'Please provide 1–2 arguments supporting your position, with any evidence or sources.'
      }
    });
  };

  const updateIbisPrompt = (field: 'elicit_issue_prompt' | 'elicit_position_prompt' | 'elicit_argument_prompt', value: string) => {
    form.updateField('facilitator_config', {
      ...form.formData.facilitator_config,
      ibis_facilitation: {
        ...(form.formData.facilitator_config.ibis_facilitation || { enabled: true, elicit_issue_prompt: '', elicit_position_prompt: '', elicit_argument_prompt: '' }),
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

          {/* Classification Prompt Override */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Classification Prompt Override</Label>
                <p className="text-sm text-muted-foreground">
                  Override the default classification prompt for this specific agent
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Template: {agent.agent_type} default
              </Badge>
            </div>

            <div className="space-y-2">
              <FormField
                type="textarea"
                label="Custom Classification Prompt"
                value={form.formData.prompt_overrides.classification_prompt || ''}
                onChange={(value) => form.updateField('prompt_overrides', {
                  ...form.formData.prompt_overrides,
                  classification_prompt: value
                })}
                placeholder="Leave empty to use template default, or enter custom classification prompt..."
                rows={2}
              />
              {form.formData.prompt_overrides.classification_prompt && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => form.updateField('prompt_overrides', {
                      ...form.formData.prompt_overrides,
                      classification_prompt: ''
                    })}
                  >
                    Clear Override
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* IBIS Facilitation Prompts (Peer Agent) */}
          {agent.agent_type === 'peer_agent' && (
            <div className="space-y-2 border-t pt-4">
              <Label className="text-base font-semibold">IBIS Facilitation Prompts</Label>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={toggleIbisFacilitation}
                  size="sm"
                >
                  {form.formData.facilitator_config.ibis_facilitation?.enabled ? 'Disable' : 'Enable'} IBIS Facilitation
                </Button>
              </div>
              {form.formData.facilitator_config.ibis_facilitation?.enabled && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="ibis-issue">Issue Elicitation Prompt</Label>
                    <Textarea
                      id="ibis-issue"
                      rows={2}
                      value={form.formData.facilitator_config.ibis_facilitation?.elicit_issue_prompt || ''}
                      onChange={(e) => updateIbisPrompt('elicit_issue_prompt', e.target.value)}
                      placeholder="Prompt to ask participants for issues first"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ibis-position">Position Elicitation Prompt</Label>
                    <Textarea
                      id="ibis-position"
                      rows={2}
                      value={form.formData.facilitator_config.ibis_facilitation?.elicit_position_prompt || ''}
                      onChange={(e) => updateIbisPrompt('elicit_position_prompt', e.target.value)}
                      placeholder="Prompt to ask for positions on a selected issue"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ibis-argument">Argument Elicitation Prompt</Label>
                    <Textarea
                      id="ibis-argument"
                      rows={2}
                      value={form.formData.facilitator_config.ibis_facilitation?.elicit_argument_prompt || ''}
                      onChange={(e) => updateIbisPrompt('elicit_argument_prompt', e.target.value)}
                      placeholder="Prompt to elicit 1–2 supporting arguments with evidence"
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