import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit2, Save, X, AlertTriangle, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface NotionEditorProps {
  deliberationId: string;
  currentNotion: string;
  onNotionUpdated: (newNotion: string) => void;
  deliberationTitle?: string;
  deliberationDescription?: string;
}

export const NotionEditor = ({ deliberationId, currentNotion, onNotionUpdated, deliberationTitle, deliberationDescription }: NotionEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotion, setEditedNotion] = useState(currentNotion);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const validateNotion = (notion: string): { isValid: boolean; warning?: string } => {
    const stanceKeywords = ['should', 'must', 'ought', 'need to', 'required', 'necessary', 'appropriate'];
    const hasStanceLanguage = stanceKeywords.some(keyword => 
      notion.toLowerCase().includes(keyword)
    );
    
    if (!hasStanceLanguage) {
      return {
        isValid: false,
        warning: 'Consider using stance language (should, must, ought) for better position scoring'
      };
    }
    
    return { isValid: true };
  };

  const handleSave = async () => {
    if (!editedNotion.trim()) {
      toast({
        title: "Error",
        description: "Notion cannot be empty",
        variant: "destructive"
      });
      return;
    }

    setIsUpdating(true);
    try {
      // Update notion directly via supabase
      const { error } = await supabase
        .from('deliberations')
        .update({ notion: editedNotion })
        .eq('id', deliberationId);
        
      if (error) throw error;
      
      onNotionUpdated(editedNotion);
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Notion updated successfully"
      });
    } catch (error) {
      logger.error('Error updating notion', { deliberationId, error });
      toast({
        title: "Error",
        description: "Failed to update notion",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setEditedNotion(currentNotion);
    setIsEditing(false);
  };

  const handleGenerate = async () => {
    if (!deliberationTitle) {
      toast({
        title: "Error",
        description: "Cannot generate notion without deliberation title",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate_notion_statement', {
        body: {
          title: deliberationTitle,
          description: deliberationDescription || ''
        }
      });

      if (error) throw error;

      if (data?.notion) {
        setEditedNotion(data.notion);
        toast({
          title: "Success",
          description: "Notion statement generated successfully"
        });
      } else {
        throw new Error('No notion generated');
      }
    } catch (error) {
      logger.error('Error generating notion', { deliberationTitle, error });
      toast({
        title: "Error",
        description: "Failed to generate notion statement",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const validation = validateNotion(editedNotion);

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-primary">
          {currentNotion || 'No notion set'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsEditing(true)}
          className="h-6 w-6 p-0"
        >
          <Edit2 className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={editedNotion}
          onChange={(e) => setEditedNotion(e.target.value.slice(0, 250))}
          placeholder="Enter notion for stance scoring"
          className="text-sm"
          maxLength={250}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={isUpdating || !editedNotion.trim()}
          className="h-8 w-8 p-0"
        >
          <Save className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          className="h-8 w-8 p-0"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={isGenerating || !deliberationTitle}
          className="h-8"
        >
          <Sparkles className="h-3 w-3 mr-2" />
          {isGenerating ? 'Generating...' : 'Generate Notion'}
        </Button>
        <span className="text-xs text-muted-foreground">
          AI will create a notion from title and description
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {editedNotion.length}/250 characters
        </span>
        {!validation.isValid && (
          <div className="flex items-center gap-1 text-xs text-yellow-600">
            <AlertTriangle className="h-3 w-3" />
            <span>{validation.warning}</span>
          </div>
        )}
      </div>
    </div>
  );
};