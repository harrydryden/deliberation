import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Edit, X, Plus } from 'lucide-react';
import { Agent, FacilitatorConfig } from '@/types/api';

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
  };

  const [formData, setFormData] = useState<LocalAgentForm>({
    name: agent.name,
    description: agent.description || '',
    response_style: agent.response_style || '',
    goals: agent.goals || [],
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
  const [goalInput, setGoalInput] = useState('');

  // Reset form data when agent changes or modal opens
  useEffect(() => {
    if (open) {
      setFormData({
        name: agent.name,
        description: agent.description || '',
        response_style: agent.response_style || '',
        goals: agent.goals || [],
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
      setGoalInput('');
    }
  }, [agent, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
  onUpdateAgent(agent.id, {
    name: formData.name,
    description: formData.description,
    response_style: formData.response_style,
    goals: formData.goals,
    facilitator_config: formData.facilitator_config,
  });
    
    setOpen(false);
  };

  const handleAddGoal = () => {
    if (goalInput.trim()) {
      setFormData(prev => ({
        ...prev,
        goals: [...prev.goals, goalInput.trim()]
      }));
      setGoalInput('');
    }
  };

  const handleRemoveGoal = (index: number) => {
    setFormData(prev => ({
      ...prev,
      goals: prev.goals.filter((_, i) => i !== index)
    }));
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
          <div className="space-y-2">
            <Label htmlFor="name">Agent Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Agent name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of this agent's purpose"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="response_style">Response Style</Label>
            <Input
              id="response_style"
              value={formData.response_style}
              onChange={(e) => setFormData(prev => ({ ...prev, response_style: e.target.value }))}
              placeholder="e.g., formal, casual, analytical"
            />
          </div>

          <div className="space-y-2">
            <Label>Goals</Label>
            <div className="flex gap-2">
              <Input
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder="Add a goal"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddGoal())}
              />
              <Button type="button" onClick={handleAddGoal} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.goals.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.goals.map((goal, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-1">
                    {goal}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => handleRemoveGoal(index)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* IBIS Facilitation Prompts (Peer Agent) */}
          {agent.agent_type === 'peer_agent' && (
            <div className="space-y-2 border-t pt-4">
              <Label className="text-base font-semibold">IBIS Facilitation Prompts</Label>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    facilitator_config: {
                      ...prev.facilitator_config,
                      ibis_facilitation: {
                        enabled: !prev.facilitator_config.ibis_facilitation?.enabled,
                        elicit_issue_prompt: prev.facilitator_config.ibis_facilitation?.elicit_issue_prompt || 'To build a coherent IBIS map, could you share 1–2 concise issues we should consider?',
                        elicit_position_prompt: prev.facilitator_config.ibis_facilitation?.elicit_position_prompt || 'What is your position on this issue (one sentence, actionable)?',
                        elicit_argument_prompt: prev.facilitator_config.ibis_facilitation?.elicit_argument_prompt || 'Please provide 1–2 arguments supporting your position, with any evidence or sources.'
                      }
                    }
                  }))}
                  size="sm"
                >
                  {formData.facilitator_config.ibis_facilitation?.enabled ? 'Disable' : 'Enable'} IBIS Facilitation
                </Button>
              </div>
              {formData.facilitator_config.ibis_facilitation?.enabled && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="ibis-issue">Issue Elicitation Prompt</Label>
                    <Textarea
                      id="ibis-issue"
                      rows={2}
                      value={formData.facilitator_config.ibis_facilitation?.elicit_issue_prompt || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        facilitator_config: {
                          ...prev.facilitator_config,
                          ibis_facilitation: {
                            ...(prev.facilitator_config.ibis_facilitation || { enabled: true, elicit_issue_prompt: '', elicit_position_prompt: '', elicit_argument_prompt: '' }),
                            elicit_issue_prompt: e.target.value
                          }
                        }
                      }))}
                      placeholder="Prompt to ask participants for issues first"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ibis-position">Position Elicitation Prompt</Label>
                    <Textarea
                      id="ibis-position"
                      rows={2}
                      value={formData.facilitator_config.ibis_facilitation?.elicit_position_prompt || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        facilitator_config: {
                          ...prev.facilitator_config,
                          ibis_facilitation: {
                            ...(prev.facilitator_config.ibis_facilitation || { enabled: true, elicit_issue_prompt: '', elicit_position_prompt: '', elicit_argument_prompt: '' }),
                            elicit_position_prompt: e.target.value
                          }
                        }
                      }))}
                      placeholder="Prompt to ask for positions on a selected issue"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ibis-argument">Argument Elicitation Prompt</Label>
                    <Textarea
                      id="ibis-argument"
                      rows={2}
                      value={formData.facilitator_config.ibis_facilitation?.elicit_argument_prompt || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        facilitator_config: {
                          ...prev.facilitator_config,
                          ibis_facilitation: {
                            ...(prev.facilitator_config.ibis_facilitation || { enabled: true, elicit_issue_prompt: '', elicit_position_prompt: '', elicit_argument_prompt: '' }),
                            elicit_argument_prompt: e.target.value
                          }
                        }
                      }))}
                      placeholder="Prompt to elicit 1–2 supporting arguments with evidence"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Agent'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};