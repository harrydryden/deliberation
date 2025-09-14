import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Lightbulb } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';

interface IssueInput {
  id: string;
  title: string;
  description: string;
}

interface ManualIbisRootsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deliberationId: string;
  deliberationTitle: string;
  onSuccess: (count: number) => void;
  onCreateIssues: (issues: Array<{ title: string; description: string }>) => Promise<void>;
}

export const ManualIbisRootsModal = ({
  isOpen,
  onClose,
  deliberationId,
  deliberationTitle,
  onSuccess,
  onCreateIssues
}: ManualIbisRootsModalProps) => {
  const [issues, setIssues] = useState<IssueInput[]>([
    { id: '1', title: '', description: '' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useSupabaseAuth();

  const addIssue = () => {
    if (issues.length < 5) {
      setIssues(prev => [...prev, { 
        id: Date.now().toString(), 
        title: '', 
        description: '' 
      }]);
    }
  };

  const removeIssue = (id: string) => {
    if (issues.length > 1) {
      setIssues(prev => prev.filter(issue => issue.id !== id));
    }
  };

  const updateIssue = (id: string, field: 'title' | 'description', value: string) => {
    setIssues(prev => prev.map(issue => 
      issue.id === id 
        ? { ...issue, [field]: value }
        : issue
    ));
  };

  const validateIssues = () => {
    const validIssues = issues.filter(issue => issue.title.trim().length > 0);
    
    if (validIssues.length === 0) {
      toast({
        title: "Validation Error",
        description: "At least one issue must have a title.",
        variant: "destructive"
      });
      return false;
    }

    const titles = validIssues.map(issue => issue.title.trim().toLowerCase());
    const uniqueTitles = new Set(titles);
    
    if (titles.length !== uniqueTitles.size) {
      toast({
        title: "Validation Error", 
        description: "Issue titles must be unique.",
        variant: "destructive"
      });
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateIssues()) return;

    const validIssues = issues
      .filter(issue => issue.title.trim().length > 0)
      .map(issue => ({
        title: issue.title.trim(),
        description: issue.description.trim() || undefined
      }));

    setIsLoading(true);
    try {
      logger.info('Creating manual IBIS roots', { 
        deliberationId, 
        count: validIssues.length,
        titles: validIssues.map(i => i.title)
      });

      await onCreateIssues(validIssues);
      
      onSuccess(validIssues.length);
      handleClose();
      
      toast({
        title: "Issues Created",
        description: `Successfully created ${validIssues.length} root issues for "${deliberationTitle}"`
      });
    } catch (error) {
      logger.error('Failed to create manual IBIS roots', error as Error, { deliberationId });
      toast({
        title: "Error",
        description: "Failed to create issues. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setIssues([{ id: '1', title: '', description: '' }]);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Create Root Issues
          </DialogTitle>
          <DialogDescription>
            Create up to 5 root issues for "{deliberationTitle}". Each issue will become a starting point for deliberation.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {issues.map((issue, index) => (
            <div key={issue.id} className="space-y-3 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Issue {index + 1}</Label>
                {issues.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeIssue(issue.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              <div className="space-y-2">
                <div>
                  <Label htmlFor={`title-${issue.id}`} className="text-xs text-muted-foreground">
                    Title* (max 200 characters)
                  </Label>
                  <Input
                    id={`title-${issue.id}`}
                    value={issue.title}
                    onChange={(e) => updateIssue(issue.id, 'title', e.target.value)}
                    placeholder="Enter the main issue or question..."
                    maxLength={200}
                    className="mt-1"
                  />
                  <div className="text-xs text-muted-foreground text-right">
                    {issue.title.length}/200
                  </div>
                </div>
                
                <div>
                  <Label htmlFor={`description-${issue.id}`} className="text-xs text-muted-foreground">
                    Description (optional, max 1000 characters)
                  </Label>
                  <Textarea
                    id={`description-${issue.id}`}
                    value={issue.description}
                    onChange={(e) => updateIssue(issue.id, 'description', e.target.value)}
                    placeholder="Provide additional context or details..."
                    maxLength={1000}
                    rows={3}
                    className="mt-1"
                  />
                  <div className="text-xs text-muted-foreground text-right">
                    {issue.description.length}/1000
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {issues.length < 5 && (
            <Button
              type="button"
              variant="outline"
              onClick={addIssue}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Issue ({issues.length}/5)
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !user}
          >
            {isLoading ? 'Creating...' : 'Create Issues'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};