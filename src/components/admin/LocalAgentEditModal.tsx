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
    character_limit: number;
    additional_response_style: string;
    goals: string[];
    facilitator_config: FacilitatorConfig;
    prompt_overrides: Record<string, string>;
  };

  // Parse existing response_style to extract character limit and additional notes
  const parseResponseStyle = (responseStyle: string) => {
    if (!responseStyle) return { characterLimit: 1500, additionalStyle: '' };
    
    const match = responseStyle.match(/Keep responses to no more than (\d+) characters\.?\s*(.*)/);
    if (match) {
      return {
        characterLimit: parseInt(match[1]) || 1500,
        additionalStyle: match[2] || ''
      };
    }
    // If it doesn't match the standard format, put the whole thing in additional style
    return { characterLimit: 1500, additionalStyle: responseStyle };
  };

  const { characterLimit: initialCharLimit, additionalStyle: initialAdditionalStyle } = parseResponseStyle(agent.response_style || '');

  const form = useForm<LocalAgentForm>({
    initialData: {
      name: agent.name,
      description: agent.description || '',
      character_limit: agent.max_response_characters || initialCharLimit,
      additional_response_style: initialAdditionalStyle,
      goals: agent.goals || [],
      prompt_overrides: agent.prompt_overrides || {},
      facilitator_config: agent.facilitator_config || {
        prompting_enabled: false,
        prompting_interval_minutes: 3,
        max_prompts_per_session: 5,
        prompting_questions: [],
        ibis_facilitation: {
          enabled: true,
          share_issue_prompt: 'To build a coherent IBIS map, let me help identify the key issues that need to be considered in this discussion. What specific issues or questions should we focus on?',
          share_position_prompt: 'Now that we have identified the issues, let me help facilitate developing clear positions. What is your stance on this issue, and how would you articulate your position?',
          share_argument_prompt: 'To strengthen our IBIS map, let me help organize the arguments. What reasons support your position, and what evidence can you provide?'
        }
      }
    },
    onSubmit: async (data) => {
      // Construct response_style from character limit and additional notes
      const response_style = `Keep responses to no more than ${data.character_limit} characters.${
        data.additional_response_style ? ` ${data.additional_response_style}` : ''
      }`;

      onUpdateAgent(agent.id, {
        name: data.name,
        description: data.description,
        response_style,
        max_response_characters: data.character_limit,
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
      const { characterLimit: resetCharLimit, additionalStyle: resetAdditionalStyle } = parseResponseStyle(agent.response_style || '');
      
      form.resetForm({
        name: agent.name,
        description: agent.description || '',
        character_limit: agent.max_response_characters || resetCharLimit,
        additional_response_style: resetAdditionalStyle,
        goals: agent.goals || [],
        prompt_overrides: agent.prompt_overrides || {},
        facilitator_config: agent.facilitator_config || {
          prompting_enabled: false,
          prompting_interval_minutes: 3,
          max_prompts_per_session: 5,
          prompting_questions: [],
          ibis_facilitation: {
            enabled: true,
            share_issue_prompt: 'To build a coherent IBIS map, let me help identify the key issues that need to be considered in this discussion. What specific issues or questions should we focus on?',
            share_position_prompt: 'Now that we have identified the issues, let me help facilitate developing clear positions. What is your stance on this issue, and how would you articulate your position?',
            share_argument_prompt: 'To strengthen our IBIS map, let me help organize the arguments. What reasons support your position, and what evidence can you provide?'
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
            label="Character Limit"
            value={form.formData.character_limit.toString()}
            onChange={(value) => form.updateField('character_limit', parseInt(value) || 1500)}
            placeholder="1500"
            inputType="number"
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

          {/* IBIS Facilitation Prompts (Flo Only) */}
          {agent.agent_type === 'flow_agent' && (agent.name === 'Flo' || agent.name.toLowerCase().includes('flo')) && (
            <div className="space-y-2 border-t pt-4">
              <Label className="text-base font-semibold">IBIS Facilitation Prompts</Label>
              <p className="text-sm text-muted-foreground">
                Configure how Flo facilitates IBIS map construction and sharing
              </p>
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
                    <Label htmlFor="ibis-issue">Issue Facilitation Prompt</Label>
                    <Textarea
                      id="ibis-issue"
                      rows={2}
                      value={form.formData.facilitator_config.ibis_facilitation?.share_issue_prompt || ''}
                      onChange={(e) => updateIbisPrompt('share_issue_prompt', e.target.value)}
                      placeholder="How to facilitate identifying and organizing issues in the IBIS map"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ibis-position">Position Facilitation Prompt</Label>
                    <Textarea
                      id="ibis-position"
                      rows={2}
                      value={form.formData.facilitator_config.ibis_facilitation?.share_position_prompt || ''}
                      onChange={(e) => updateIbisPrompt('share_position_prompt', e.target.value)}
                      placeholder="How to facilitate developing and organizing positions in the IBIS map"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ibis-argument">Argument Facilitation Prompt</Label>
                    <Textarea
                      id="ibis-argument"
                      rows={2}
                      value={form.formData.facilitator_config.ibis_facilitation?.share_argument_prompt || ''}
                      onChange={(e) => updateIbisPrompt('share_argument_prompt', e.target.value)}
                      placeholder="How to facilitate developing and organizing arguments in the IBIS map"
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