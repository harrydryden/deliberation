import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, RefreshCw } from 'lucide-react';
import { Deliberation } from '@/types/index';
import { serviceContainer } from '@/services/domain/container';
import { useToast } from '@/hooks/use-toast';

interface DeliberationStatusManagerProps {
  deliberation: Deliberation;
  updating: string | null;
  clearing: { [key: string]: 'messages' | 'ibis' | null };
  onStatusUpdate: (id: string, status: string) => void;
  onClearMessages: (id: string, title: string) => void;
  onClearIbis: (id: string, title: string) => void;
}

export const DeliberationStatusManager = ({ 
  deliberation, 
  updating, 
  clearing,
  onStatusUpdate,
  onClearMessages,
  onClearIbis
}: DeliberationStatusManagerProps) => {
  const { toast } = useToast();
  const adminService = serviceContainer.adminService;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      'draft': 'secondary',
      'active': 'default',
      'concluded': 'destructive',
      'archived': 'secondary'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const handleStatusUpdate = async (newStatus: string) => {
    await onStatusUpdate(deliberation.id, newStatus);
  };

  return (
    <div className="flex items-center gap-2">
      {getStatusBadge(deliberation.status)}
      
      <Select
        value={deliberation.status}
        onValueChange={handleStatusUpdate}
        disabled={updating === deliberation.id}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="concluded">Concluded</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            size="sm"
            disabled={clearing[deliberation.id] === 'messages'}
          >
            {clearing[deliberation.id] === 'messages' ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Clear Messages
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Messages</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all messages from "{deliberation.title}". 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onClearMessages(deliberation.id, deliberation.title)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear Messages
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            size="sm"
            disabled={clearing[deliberation.id] === 'ibis'}
          >
            {clearing[deliberation.id] === 'ibis' ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Clear IBIS
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All IBIS Nodes</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all IBIS nodes and relationships from "{deliberation.title}". 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onClearIbis(deliberation.id, deliberation.title)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear IBIS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};