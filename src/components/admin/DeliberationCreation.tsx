import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Lightbulb } from 'lucide-react';
import { useForm } from '@/hooks/useForm';
import { FormField } from '@/components/forms/FormField';
import { NotionExamples } from '@/components/forms/NotionExamples';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDeliberationService } from '@/hooks/useDeliberationService';
import { logger } from '@/utils/logger';

interface DeliberationCreationProps {
  onDeliberationCreated: () => void;
}

type DeliberationForm = {
  title: string;
  description: string;
  notion: string;
  is_public: boolean;
  max_participants: number;
  status: 'draft' | 'active' | 'concluded';
  facilitator_id?: string;
};

export const DeliberationCreation = ({ onDeliberationCreated }: DeliberationCreationProps) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const deliberationService = useDeliberationService();
  
  const form = useForm<DeliberationForm>({
    initialData: {
      title: '',
      description: '',
      notion: '',
      is_public: true,
      max_participants: 50,
      status: 'draft' as const,
      facilitator_id: undefined
    },
    validate: (data) => {
      const errors: Record<string, string> = {};
      
      if (!data.title.trim()) {
        errors.title = 'Title is required';
      }
      
      if (!data.notion.trim()) {
        errors.notion = 'Notion is required for stance scoring';
      } else {
        // Validate stance language
        const stanceKeywords = ['should', 'must', 'ought', 'need to', 'required', 'necessary', 'appropriate'];
        const hasStanceLanguage = stanceKeywords.some(keyword => 
          data.notion.toLowerCase().includes(keyword)
        );
        if (!hasStanceLanguage) {
          errors.notion = 'Notion should contain stance language (should, must, ought) for better analysis';
        }
      }
      
      if (data.description.length > 400) {
        errors.description = 'Description must be 400 characters or less';
      }
      
      if (data.notion.length > 100) {
        errors.notion = 'Notion must be 100 characters or less';
      }
      
      return Object.keys(errors).length > 0 ? errors : null;
    },
    onSubmit: async (data) => {
      // Create deliberation
      const createData: any = {
        ...data,
        status: data.status || 'draft',
        facilitator_id: data.facilitator_id || null,
        start_time: null,
        end_time: null
      };
      const deliberation = await deliberationService.createDeliberation(createData);
      
      toast.success('Deliberation created successfully. You can add IBIS nodes manually through the admin interface.');
      
      setCreateOpen(false);
      form.resetForm();
      onDeliberationCreated();
    }
  });
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await form.handleSubmit(e);
  };

  const handleSelectExample = (notion: string) => {
    form.updateField('notion', notion);
    setShowExamples(false);
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
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField
                type="input"
                label="Title"
                value={form.formData.title}
                onChange={(value) => form.updateField('title', value)}
                placeholder="Enter deliberation title"
                required
                error={form.errors.title}
              />
              
              <FormField
                type="textarea"
                label="Description"
                value={form.formData.description}
                onChange={(value) => form.updateField('description', value.slice(0, 400))}
                placeholder="Describe what this deliberation is about (max 400 chars)"
                rows={4}
                error={form.errors.description}
              />
              <p className="text-xs text-muted-foreground -mt-1">
                {form.formData.description.length}/400 characters
              </p>
              
              <FormField
                type="input"
                label="Notion"
                value={form.formData.notion}
                onChange={(value) => form.updateField('notion', value.slice(0, 100))}
                placeholder="Enter the core notion for stance scoring (max 100 chars)"
                required
                error={form.errors.notion}
              />
              <div className="flex items-center justify-between -mt-1">
                <p className="text-xs text-muted-foreground">
                  {form.formData.notion.length}/100 characters - Used to determine if messages are supportive or opposing
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowExamples(!showExamples)}
                  className="text-xs h-6"
                >
                  <Lightbulb className="h-3 w-3 mr-1" />
                  {showExamples ? 'Hide' : 'Show'} Examples
                </Button>
              </div>
              
              {showExamples && (
                <NotionExamples onSelectExample={handleSelectExample} />
              )}
              
              <FormField
                type="switch"
                label="Public deliberation"
                checked={form.formData.is_public}
                onChange={(checked) => form.updateField('is_public', checked)}
              />
              
              <FormField
                type="input"
                label="Maximum Participants"
                value={form.formData.max_participants.toString()}
                onChange={(value) => form.updateField('max_participants', parseInt(value) || 50)}
                placeholder="50"
              />
              
              <Button 
                type="submit"
                className="w-full bg-democratic-blue hover:bg-democratic-blue/90"
                disabled={form.isSubmitting}
              >
                {form.isSubmitting ? 'Creating...' : 'Create Deliberation'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};