import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Eye, GitBranch, Map, Edit, Lightbulb, Trash2, Database } from 'lucide-react';
import { formatToUKDateTime } from '@/utils/timeUtils';
import { Deliberation } from '@/types/index';
import { ExpandableText } from '@/components/common/ExpandableText';
import { useNavigate } from 'react-router-dom';
import { NotionEditor } from '../NotionEditor';
import { serviceContainer } from '@/services/domain/container';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';
import { useOptimizedApiCalls } from '@/hooks/useOptimizedAsync';

interface DeliberationTableRowProps {
  deliberation: Deliberation;
  updating: string | null;
  clearing: { [key: string]: 'messages' | 'ibis' | null };
  onStatusUpdate: (id: string, status: string) => void;
  onEditNodes: (deliberation: Deliberation) => void;
  onEditMap: (deliberation: Deliberation) => void;
  onNotionUpdated: (deliberationId: string, newNotion: string) => void;
  onClearMessages: (deliberationId: string, deliberationTitle: string) => void;
  onClearIbis: (deliberationId: string, deliberationTitle: string) => void;
  onCreateIssues: (deliberation: Deliberation) => void;
}

export const DeliberationTableRow = ({
  deliberation,
  updating,
  clearing,
  onStatusUpdate,
  onEditNodes,
  onEditMap,
  onNotionUpdated,
  onClearMessages,
  onClearIbis,
  onCreateIssues
}: DeliberationTableRowProps) => {
  const navigate = useNavigate();
  
  const formatDate = (dateString: string) => {
    return formatToUKDateTime(dateString, 'dd MMM yyyy HH:mm');
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        {deliberation.title}
      </TableCell>
      <TableCell>
        <Select
          value={deliberation.status}
          onValueChange={(value) => onStatusUpdate(deliberation.id, value)}
          disabled={updating === deliberation.id}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <ExpandableText 
          text={deliberation.notion} 
          placeholder="No notion set"
          title={`Notion for "${deliberation.title}"`}
          maxLength={60}
        />
      </TableCell>
      <TableCell>
        <ExpandableText 
          text={deliberation.description} 
          placeholder="No description"
          title={`Description for "${deliberation.title}"`}
          maxLength={50}
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(deliberation.createdAt)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(deliberation.updatedAt)}
      </TableCell>
      <TableCell>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/deliberations/${deliberation.id}`)}
          >
            <Eye className="h-4 w-4 mr-2" />
            View
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEditNodes(deliberation)}
          >
            <GitBranch className="h-4 w-4 mr-2" />
            Edit Nodes
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEditMap(deliberation)}
          >
            <Map className="h-4 w-4 mr-2" />
            Edit Map
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCreateIssues(deliberation)}
          >
            <Lightbulb className="h-4 w-4 mr-2" />
            Create Issues
          </Button>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Notion
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Notion for "{deliberation.title}"</DialogTitle>
              </DialogHeader>
              <NotionEditor
                deliberationId={deliberation.id}
                currentNotion={deliberation.notion || ''}
                onNotionUpdated={(newNotion) => onNotionUpdated(deliberation.id, newNotion)}
                deliberationTitle={deliberation.title}
                deliberationDescription={deliberation.description}
              />
            </DialogContent>
          </Dialog>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={clearing[deliberation.id] === 'messages'}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {clearing[deliberation.id] === 'messages' ? 'Clearing...' : 'Clear Messages'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All Messages</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all messages from all users in "{deliberation.title}". 
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onClearMessages(deliberation.id, deliberation.title)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Clear All Messages
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={clearing[deliberation.id] === 'ibis'}
              >
                <Database className="h-4 w-4 mr-2" />
                {clearing[deliberation.id] === 'ibis' ? 'Clearing...' : 'Clear IBIS'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All IBIS Data</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all IBIS nodes, relationships, and data from "{deliberation.title}". 
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onClearIbis(deliberation.id, deliberation.title)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Clear All IBIS Data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
};