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
import { logger } from '@/utils/logger';

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
    category: 'classification_prompt',
    name: '',
    templateText: '',
    description: '',
    isActive: true
  });

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const data = await promptService.getPromptTemplates();
      setPrompts(data);
    } catch (error) {
      logger.error('Failed to load prompts', { error });
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
      category: prompt.category,
      name: prompt.name,
      templateText: prompt.templateText,
      description: prompt.description || '',
      isActive: prompt.isActive
    });
  };

  const handleCreatePrompt = () => {
    setCreating(true);
    setEditForm({
      category: 'classification_prompt',
      name: '',
      templateText: '',
      description: '',
      isActive: true
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPrompt) return;
    
    setUpdating(editingPrompt.id);
    try {
      const updateData = {
        category: editForm.category,
        name: editForm.name,
        templateText: editForm.templateText,
        description: editForm.description,
        isActive: editForm.isActive,
        version: editingPrompt.version,
      };
      
      await promptService.updatePromptTemplate(editingPrompt.id, updateData);
      setEditingPrompt(null);
      await loadPrompts();
    } catch (error) {
      logger.error('Failed to update prompt', { promptId: editingPrompt.id, error });
    } finally {
      setUpdating(null);
    }
  };

  const handleSaveNewPrompt = async () => {
    setUpdating('creating');
    try {
      const newPromptData = {
        category: editForm.category,
        name: editForm.name,
        templateText: editForm.templateText,
        description: editForm.description,
        isActive: editForm.isActive,
        version: 1,
      };
      
      await promptService.createPromptTemplate(newPromptData);
      setCreating(false);
      await loadPrompts();
    } catch (error) {
      logger.error('Failed to create prompt', { promptData: editForm, error });
    } finally {
      setUpdating(null);
    }
  };

  const getPromptTypeBadge = (category: string) => {
    switch(category) {
      case 'classification_prompt': return <Badge variant="outline">Classification</Badge>;
      case 'system_prompt': return <Badge variant="secondary">System</Badge>;
      case 'facilitator_prompt': return <Badge variant="default">Facilitator</Badge>;
      default: return <Badge variant="outline">{category}</Badge>;
    }
  };

  const getAgentTypeBadge = (type: string) => {
    switch(type) {
      case 'global': return <Badge variant="secondary">Global</Badge>;
      case 'local': return <Badge variant="outline">Local</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  const renderEditDialog = (isCreating: boolean) => (
    <DialogContent className="!grid-none flex flex-col max-w-5xl h-[85vh] max-h-[85vh] p-0">
      <div className="flex-shrink-0 p-6 pb-4 border-b">
        <DialogTitle>{isCreating ? 'Create New Prompt Template' : 'Edit Prompt Template'}</DialogTitle>
      </div>
      
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prompt-type">Prompt Type</Label>
              <Select value={editForm.category} onValueChange={(value) => setEditForm(prev => ({ ...prev, category: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select prompt type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="classification_prompt">Classification Prompt</SelectItem>
                  <SelectItem value="ibis_generation_prompt">IBIS Generation Prompt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="agent-type">Agent Type (Optional)</Label>
              <Select value="global" onValueChange={() => {}}>
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
              className="resize-none"
            />
          </div>
          
          <div>
            <Label htmlFor="prompt-template">Prompt Template</Label>
            <Textarea
              id="prompt-template"
              value={editForm.templateText}
              onChange={(e) => setEditForm(prev => ({ ...prev, templateText: e.target.value }))}
              placeholder="Enter the prompt template..."
              rows={8}
              className="font-mono text-sm resize-y min-h-[200px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use {'{'}placeholders{'}'} for dynamic values like {'{'}content{'}'}, {'{'}title{'}'}, etc. You can resize this field vertically.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                checked={editForm.isActive}
                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, isActive: checked }))}
              />
              <Label>Active</Label>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-shrink-0 flex justify-end gap-2 p-6 pt-4 border-t bg-background">
        <Button variant="outline" onClick={() => isCreating ? setCreating(false) : setEditingPrompt(null)}>
          Cancel
        </Button>
        <Button 
          onClick={isCreating ? handleSaveNewPrompt : handleSaveEdit}
          disabled={updating !== null || !editForm.name || !editForm.templateText}
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
          System Prompts
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
              Active: {prompts.filter(p => p.isActive).length}
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
                    </TableCell>
                    <TableCell>
                      {getPromptTypeBadge(prompt.category)}
                    </TableCell>
                    <TableCell>
                      {getAgentTypeBadge('global')}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {prompt.description || 'No description'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={prompt.isActive ? "default" : "secondary"}>
                        {prompt.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(prompt.createdAt).toLocaleDateString()}
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