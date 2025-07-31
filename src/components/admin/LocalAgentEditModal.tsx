import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Edit, X, Plus } from 'lucide-react';
import { Agent } from '@/types/api';

interface LocalAgentEditModalProps {
  agent: Agent;
  onUpdateAgent: (id: string, config: Partial<Agent>) => void;
  loading?: boolean;
}

export const LocalAgentEditModal = ({ agent, onUpdateAgent, loading }: LocalAgentEditModalProps) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: agent.name,
    description: agent.description || '',
    system_prompt: agent.system_prompt || '',
    response_style: agent.response_style || '',
    goals: agent.goals || [],
  });
  const [goalInput, setGoalInput] = useState('');

  // Reset form data when agent changes or modal opens
  useEffect(() => {
    if (open) {
      setFormData({
        name: agent.name,
        description: agent.description || '',
        system_prompt: agent.system_prompt || '',
        response_style: agent.response_style || '',
        goals: agent.goals || [],
      });
      setGoalInput('');
    }
  }, [agent, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onUpdateAgent(agent.id, {
      name: formData.name,
      description: formData.description,
      system_prompt: formData.system_prompt,
      response_style: formData.response_style,
      goals: formData.goals,
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
            <Label htmlFor="system_prompt">System Prompt</Label>
            <Textarea
              id="system_prompt"
              value={formData.system_prompt}
              onChange={(e) => setFormData(prev => ({ ...prev, system_prompt: e.target.value }))}
              placeholder="Define the agent's behavior and instructions"
              rows={4}
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