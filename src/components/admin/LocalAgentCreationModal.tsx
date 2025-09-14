import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { LocalAgentCreate, Deliberation } from '@/types/index';
import { Textarea } from '@/components/ui/textarea';

interface LocalAgentCreationModalProps {
  deliberations: Deliberation[];
  onCreateAgent: (config: LocalAgentCreate) => void;
  loading?: boolean;
}

export const LocalAgentCreationModal = ({ deliberations, onCreateAgent, loading }: LocalAgentCreationModalProps) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<LocalAgentCreate & { 
    character_limit: number;
    additional_response_style: string;
  }>({
    name: '',
    agent_type: '',
    deliberationId: '',
    character_limit: 1500,
    additional_response_style: '',
  });

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
    
    // Construct response_style from character limit and additional notes
    const response_style = `Keep responses to no more than ${formData.character_limit} characters.${
      formData.additional_response_style ? ` ${formData.additional_response_style}` : ''
    }`;
    
    onCreateAgent({
      ...formData,
      response_style,
      max_response_characters: formData.character_limit
    });
    setOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      agent_type: '',
      deliberationId: '',
      character_limit: 1500,
      additional_response_style: '',
    });
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Local Agent</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Creates an agent that inherits configuration from the selected global agent template
          </p>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <p className="text-xs text-muted-foreground">
              The agent will inherit system prompt, goals, and other settings from the global {formData.agent_type ? agentTypes.find(t => t.value === formData.agent_type)?.label : 'agent'} template
              {formData.agent_type === 'flow_agent' && (formData.name === 'Flo' || formData.name.toLowerCase().includes('flo')) && (
                <span className="block mt-1 text-xs text-green-600">IBIS Facilitation prompts will be available for this Flo agent</span>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="character_limit">Character Limit *</Label>
            <Input
              id="character_limit"
              type="number"
              min="100"
              max="4000"
              value={formData.character_limit}
              onChange={(e) => setFormData(prev => ({ ...prev, character_limit: parseInt(e.target.value) || 1500 }))}
              placeholder="1500"
              className={formData.character_limit < 1000 ? "border-orange-500" : ""}
              required
            />
            {formData.character_limit < 1000 && (
              <p className="text-xs text-orange-600 font-medium">
                  Warning: Character limits below 1000 may result in blank responses from gpt-4o-mini.
               </p>
             )}
             <p className="text-xs text-muted-foreground">
               Maximum characters for agent responses. Recommended: 1500+ for gpt-4o-mini.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="additional_style">Additional Response Style (Optional)</Label>
            <Textarea
              id="additional_style"
              value={formData.additional_response_style}
              onChange={(e) => setFormData(prev => ({ ...prev, additional_response_style: e.target.value }))}
              placeholder="e.g., Use formal tone, provide examples, etc."
              rows={2}
            />
          </div>

          {/* Response Style Preview */}
          <div className="space-y-2 p-3 bg-muted/50 rounded-md">
            <Label className="text-sm font-medium">Response Style Preview:</Label>
            <p className="text-sm text-muted-foreground">
              Keep responses to no more than {formData.character_limit} characters.
              {formData.additional_response_style ? ` ${formData.additional_response_style}` : ''}
            </p>
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