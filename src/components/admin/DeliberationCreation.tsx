import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDeliberationService } from '@/hooks/useDeliberationService';

interface DeliberationCreationProps {
  onDeliberationCreated: () => void;
}

export const DeliberationCreation = ({ onDeliberationCreated }: DeliberationCreationProps) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    is_public: true,
    max_participants: 50
  });
  
  const { toast } = useToast();
  const deliberationService = useDeliberationService();

  const handleCreateDeliberation = async () => {
    if (!formData.title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a title for the deliberation",
        variant: "destructive"
      });
      return;
    }

    setCreating(true);
    try {
      await deliberationService.createDeliberation(formData);
      toast({
        title: "Success",
        description: "Deliberation created successfully"
      });
      setCreateOpen(false);
      setFormData({ title: '', description: '', is_public: true, max_participants: 50 });
      onDeliberationCreated();
    } catch (error) {
      console.error('Failed to create deliberation:', error);
      toast({
        title: "Error",
        description: "Failed to create deliberation. Only administrators can create deliberations.",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Create New Deliberation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4">
          Create new deliberations for users to participate in structured discussions.
        </p>
        
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-democratic-blue hover:bg-democratic-blue/90">
              <Plus className="h-4 w-4 mr-2" />
              Create Deliberation
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Deliberation</DialogTitle>
              <DialogDescription>
                Set up a new deliberation for structured discussion
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter deliberation title"
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this deliberation is about"
                  rows={3}
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_public"
                  checked={formData.is_public}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_public: checked }))}
                />
                <Label htmlFor="is_public">Public deliberation</Label>
              </div>
              
              <div>
                <Label htmlFor="max_participants">Maximum Participants</Label>
                <Input
                  id="max_participants"
                  type="number"
                  value={formData.max_participants}
                  onChange={(e) => setFormData(prev => ({ ...prev, max_participants: parseInt(e.target.value) || 50 }))}
                  min={2}
                  max={200}
                />
              </div>
              
              <Button 
                onClick={handleCreateDeliberation}
                className="w-full bg-democratic-blue hover:bg-democratic-blue/90"
                disabled={!formData.title.trim() || creating}
              >
                {creating ? 'Creating...' : 'Create Deliberation'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};