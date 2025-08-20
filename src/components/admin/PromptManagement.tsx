import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, MessageSquare, Edit, Plus, X } from 'lucide-react';
import { formatToUKDate } from '@/utils/timeUtils';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { PromptTemplate, promptService } from '@/services/domain/implementations/prompt.service';

interface PromptManagementProps {
  onLoad?: () => void;
}

export const PromptManagement = ({ onLoad }: PromptManagementProps) => {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    prompt_type: 'system_prompt',
    agent_type: 'global',
    name: '',
    template: '',
    description: '',
    is_default: false,
    is_active: true
  });

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const data = await promptService.getPromptTemplates();
      setPrompts(data);
    } catch (error) {
      console.error('Failed to load prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleEditClick = (prompt: PromptTemplate) => {
    setEditingPrompt(prompt);
    setEditForm({
      prompt_type: prompt.prompt_type,
      agent_type: prompt.agent_type || 'global',
      name: prompt.name,
      template: prompt.template,
      description: prompt.description || '',
      is_default: prompt.is_default,
      is_active: prompt.is_active
    });
  };

  const handleCreatePrompt = () => {
    setCreating(true);
    setEditForm({
      prompt_type: 'system_prompt',
      agent_type: 'global',
      name: '',
      template: '',
      description: '',
      is_default: false,
      is_active: true
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPrompt) return;
    
    setUpdating(editingPrompt.id);
    try {
      await promptService.updatePromptTemplate(editingPrompt.id, {
        prompt_type: editForm.prompt_type,
        agent_type: editForm.agent_type === 'global' ? null : editForm.agent_type,
        name: editForm.name,
        template: editForm.template,
        description: editForm.description,
        is_default: editForm.is_default,
        is_active: editForm.is_active
      });
      setEditingPrompt(null);
      await loadPrompts();
    } catch (error) {
      console.error('Failed to update prompt:', error);
    } finally {
      setUpdating(null);
    }
  };

  const handleSaveNewPrompt = async () => {
    setUpdating('creating');
    try {
      await promptService.createPromptTemplate({
        prompt_type: editForm.prompt_type,
        agent_type: editForm.agent_type === 'global' ? null : editForm.agent_type,
        name: editForm.name,
        template: editForm.template,
        description: editForm.description,
        is_default: editForm.is_default,
        is_active: editForm.is_active
      });
      setCreating(false);
      await loadPrompts();
    } catch (error) {
      console.error('Failed to create prompt:', error);
    } finally {
      setUpdating(null);
    }
  };

  const getPromptTypeBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      'system_prompt': 'default',
      'classification_prompt': 'secondary',
      'ibis_generation_prompt': 'destructive'
    };
    return <Badge variant={variants[type] || 'default'}>{type}</Badge>;
  };

  const getAgentTypeBadge = (type?: string) => {
    if (!type || type === 'global') return <Badge variant="outline">Global</Badge>;
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      'bill_agent': 'default',
      'peer_agent': 'secondary',
      'flow_agent': 'destructive'
    };
    return <Badge variant={variants[type] || 'default'}>{type}</Badge>;
  };

  const renderEditDialog = (isCreating: boolean) => (
    <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle>{isCreating ? 'Create New Prompt Template' : 'Edit Prompt Template'}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 overflow-y-auto flex-1 px-1">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="prompt-type">Prompt Type</Label>
            <Select value={editForm.prompt_type} onValueChange={(value) => setEditForm(prev => ({ ...prev, prompt_type: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select prompt type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system_prompt">System Prompt</SelectItem>
                <SelectItem value="classification_prompt">Classification Prompt</SelectItem>
                <SelectItem value="ibis_generation_prompt">IBIS Generation Prompt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="agent-type">Agent Type (Optional)</Label>
            <Select value={editForm.agent_type} onValueChange={(value) => setEditForm(prev => ({ ...prev, agent_type: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select agent type or leave blank for global" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (All Agents)</SelectItem>
                <SelectItem value="bill_agent">Bill Agent</SelectItem>
                <SelectItem value="peer_agent">Peer Agent</SelectItem>
                <SelectItem value="flow_agent">Flow Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="prompt-name">Name</Label>
          <Input
            id="prompt-name"
            value={editForm.name}
            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter prompt name"
          />
        </div>
        <div>
          <Label htmlFor="prompt-description">Description</Label>
          <Textarea
            id="prompt-description"
            value={editForm.description}
            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Describe what this prompt does"
            rows={2}
          />
        </div>
        <div>
          <Label htmlFor="prompt-template">Prompt Template</Label>
          <Textarea
            id="prompt-template"
            value={editForm.template}
            onChange={(e) => setEditForm(prev => ({ ...prev, template: e.target.value }))}
            placeholder="Enter the prompt template..."
            rows={10}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use {'{'}placeholders{'}'} for dynamic values like {'{'}content{'}'}, {'{'}title{'}'}, etc.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              checked={editForm.is_default}
              onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_default: checked }))}
            />
            <Label>Set as default for this type</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              checked={editForm.is_active}
              onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_active: checked }))}
            />
            <Label>Active</Label>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={() => isCreating ? setCreating(false) : setEditingPrompt(null)}>
          Cancel
        </Button>
        <Button 
          onClick={isCreating ? handleSaveNewPrompt : handleSaveEdit}
          disabled={updating !== null || !editForm.name || !editForm.template}
        >
          {updating !== null ? (isCreating ? 'Creating...' : 'Updating...') : (isCreating ? 'Create Prompt' : 'Update Prompt')}
        </Button>
      </div>
    </DialogContent>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Prompt Template Management
        </CardTitle>
        <div className="flex gap-2">
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm" onClick={handleCreatePrompt}>
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </DialogTrigger>
            {renderEditDialog(true)}
          </Dialog>
          <Button variant="outline" size="sm" onClick={loadPrompts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && prompts.length === 0 ? (
          <LoadingSpinner />
        ) : prompts.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No prompt templates found</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Total templates: {prompts.length} | 
              Active: {prompts.filter(p => p.is_active).length} |
              Defaults: {prompts.filter(p => p.is_default).length}
            </p>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.map((prompt) => (
                  <TableRow key={prompt.id}>
                    <TableCell className="font-medium">
                      {prompt.name}
                      {prompt.is_default && <Badge variant="outline" className="ml-2">Default</Badge>}
                    </TableCell>
                    <TableCell>
                      {getPromptTypeBadge(prompt.prompt_type)}
                    </TableCell>
                    <TableCell>
                      {getAgentTypeBadge(prompt.agent_type)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {prompt.description || 'No description'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={prompt.is_active ? 'default' : 'secondary'}>
                        {prompt.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatToUKDate(prompt.created_at)}
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditClick(prompt)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        {renderEditDialog(false)}
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