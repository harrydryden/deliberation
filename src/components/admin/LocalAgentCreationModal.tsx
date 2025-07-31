import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';
import { LocalAgentCreate, Deliberation } from '@/types/api';

interface LocalAgentCreationModalProps {
  deliberations: Deliberation[];
  onCreateAgent: (config: LocalAgentCreate) => void;
  loading?: boolean;
}

export const LocalAgentCreationModal = ({ deliberations, onCreateAgent, loading }: LocalAgentCreationModalProps) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<LocalAgentCreate>({
    name: '',
    description: '',
    system_prompt: '',
    response_style: '',
    goals: [],
    agent_type: '',
    deliberationId: '',
  });
  const [goalInput, setGoalInput] = useState('');

  const agentTypes = [
    { value: 'bill_agent', label: 'Bill Agent' },
    { value: 'peer_agent', label: 'Peer Agent' },
    { value: 'flow_agent', label: 'Flow Agent' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.agent_type || !formData.deliberationId) {
      return;
    }
    
    onCreateAgent(formData);
    setOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      system_prompt: '',
      response_style: '',
      goals: [],
      agent_type: '',
      deliberationId: '',
    });
    setGoalInput('');
  };

  const handleAddGoal = () => {
    if (goalInput.trim()) {
      setFormData(prev => ({
        ...prev,
        goals: [...(prev.goals || []), goalInput.trim()]
      }));
      setGoalInput('');
    }
  };

  const handleRemoveGoal = (index: number) => {
    setFormData(prev => ({
      ...prev,
      goals: prev.goals?.filter((_, i) => i !== index) || []
    }));
  };

  const activeDeliberations = deliberations.filter(d => d.status === 'active' || d.status === 'draft');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Create Local Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Local Agent</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Agent Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Custom Bill Agent"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="agent_type">Agent Type *</Label>
              <Select
                value={formData.agent_type}
                onValueChange={(value) => setFormData(prev => ({ ...prev, agent_type: value }))}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select agent type" />
                </SelectTrigger>
                <SelectContent>
                  {agentTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deliberation">Deliberation *</Label>
            <Select
              value={formData.deliberationId}
              onValueChange={(value) => setFormData(prev => ({ ...prev, deliberationId: value }))}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select deliberation" />
              </SelectTrigger>
              <SelectContent>
                {activeDeliberations.map((deliberation) => (
                  <SelectItem key={deliberation.id} value={deliberation.id}>
                    <div className="flex items-center gap-2">
                      <span>{deliberation.title}</span>
                      <Badge variant={deliberation.status === 'active' ? 'default' : 'secondary'}>
                        {deliberation.status}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {formData.goals && formData.goals.length > 0 && (
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
              {loading ? 'Creating...' : 'Create Agent'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};