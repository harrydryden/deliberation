import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { RefreshCw, MessageSquare, Eye, GitBranch, Trash2, Database, Map } from 'lucide-react';
import { formatToUKDateTime } from '@/utils/timeUtils';
import { Deliberation } from '@/types/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useNavigate } from 'react-router-dom';
import { IbisNodeManagement } from './IbisNodeManagement';
import { AdminIbisMapEditor } from './AdminIbisMapEditor';
import { useAdminService } from '@/hooks/useServices';
import { useToast } from '@/hooks/use-toast';

interface DeliberationOverviewProps {
  deliberations: Deliberation[];
  loading: boolean;
  onLoad: () => void;
  onUpdateStatus: (id: string, status: string) => void;
}

export const DeliberationOverview = ({ deliberations, loading, onLoad, onUpdateStatus }: DeliberationOverviewProps) => {
  console.log('🔍 DeliberationOverview - Component rendered with deliberations:', deliberations.length);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedDeliberation, setSelectedDeliberation] = useState<Deliberation | null>(null);
  const [editMode, setEditMode] = useState<'nodes' | 'map' | null>(null);
  const [clearing, setClearing] = useState<{ [key: string]: 'messages' | 'ibis' | null }>({});
  const navigate = useNavigate();
  const adminService = useAdminService();
  const { toast } = useToast();

  useEffect(() => {
    if (deliberations.length === 0 && !loading) {
      onLoad();
    }
  }, [deliberations.length, loading, onLoad]);

  const handleStatusUpdate = async (id: string, status: string) => {
    setUpdating(id);
    try {
      await onUpdateStatus(id, status);
    } finally {
      setUpdating(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      'draft': 'secondary',
      'active': 'default',
      'completed': 'destructive',
      'archived': 'secondary'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return formatToUKDateTime(dateString, 'dd MMM yyyy HH:mm');
  };

  const handleEditNodes = (deliberation: Deliberation) => {
    console.log('🔍 DeliberationOverview - Edit Nodes clicked for deliberation:', deliberation.id, deliberation.title);
    setSelectedDeliberation(deliberation);
    setEditMode('nodes');
    console.log('🔍 DeliberationOverview - State set, editMode should now be "nodes"');
  };

  const handleEditMap = (deliberation: Deliberation) => {
    console.log('🔍 DeliberationOverview - Edit Map clicked for deliberation:', deliberation.id, deliberation.title);
    setSelectedDeliberation(deliberation);
    setEditMode('map');
    console.log('🔍 DeliberationOverview - State set, editMode should now be "map"');
  };

  const handleBackFromEdit = () => {
    setSelectedDeliberation(null);
    setEditMode(null);
  };

  const handleClearMessages = async (deliberationId: string, deliberationTitle: string) => {
    setClearing(prev => ({ ...prev, [deliberationId]: 'messages' }));
    try {
      await adminService.clearDeliberationMessages(deliberationId);
      toast({
        title: "Success",
        description: `All messages cleared from "${deliberationTitle}"`
      });
    } catch (error) {
      console.error('Failed to clear messages:', error);
      toast({
        title: "Error",
        description: "Failed to clear messages. Please try again.",
        variant: "destructive"
      });
    } finally {
      setClearing(prev => ({ ...prev, [deliberationId]: null }));
    }
  };

  const handleClearIbis = async (deliberationId: string, deliberationTitle: string) => {
    setClearing(prev => ({ ...prev, [deliberationId]: 'ibis' }));
    try {
      await adminService.clearDeliberationIbis(deliberationId);
      toast({
        title: "Success",
        description: `All IBIS data cleared from "${deliberationTitle}"`
      });
    } catch (error) {
      console.error('Failed to clear IBIS data:', error);
      toast({
        title: "Error",
        description: "Failed to clear IBIS data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setClearing(prev => ({ ...prev, [deliberationId]: null }));
    }
  };

  console.log('🔍 DeliberationOverview - Render check:', {
    selectedDeliberation: selectedDeliberation?.id,
    editMode,
    shouldRenderNodes: selectedDeliberation && editMode === 'nodes',
    shouldRenderMap: selectedDeliberation && editMode === 'map'
  });

  if (selectedDeliberation && editMode === 'nodes') {
    console.log('🔍 DeliberationOverview - Rendering IbisNodeManagement');
    try {
      return (
        <IbisNodeManagement
          deliberationId={selectedDeliberation.id}
          deliberationTitle={selectedDeliberation.title}
          onBack={handleBackFromEdit}
        />
      );
    } catch (error) {
      console.error('🚨 Error rendering IbisNodeManagement:', error);
      return <div>Error loading node management</div>;
    }
  }

  if (selectedDeliberation && editMode === 'map') {
    console.log('🔍 DeliberationOverview - Rendering AdminIbisMapEditor with:', {
      deliberationId: selectedDeliberation.id,
      deliberationTitle: selectedDeliberation.title,
      editMode
    });
    return (
      <AdminIbisMapEditor
        deliberationId={selectedDeliberation.id}
        deliberationTitle={selectedDeliberation.title}
        onBack={handleBackFromEdit}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Deliberation Overview
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onLoad} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading && deliberations.length === 0 ? (
          <LoadingSpinner />
        ) : deliberations.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No deliberations found</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{deliberations.length}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {deliberations.filter(d => d.status === 'active').length}
                </div>
                <div className="text-sm text-muted-foreground">Active</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {deliberations.filter(d => d.status === 'draft').length}
                </div>
                <div className="text-sm text-muted-foreground">Draft</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {deliberations.filter(d => d.status === 'completed').length}
                </div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notion</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliberations.map((deliberation) => (
                  <TableRow key={deliberation.id}>
                    <TableCell className="font-medium">
                      {deliberation.title}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={deliberation.status}
                        onValueChange={(value) => handleStatusUpdate(deliberation.id, value)}
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
                    <TableCell className="max-w-xs">
                      <div className="text-sm font-medium text-primary">
                        {deliberation.notion || 'No notion set'}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {deliberation.description || 'No description'}
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
                          onClick={() => handleEditNodes(deliberation)}
                        >
                          <GitBranch className="h-4 w-4 mr-2" />
                          Edit Nodes
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditMap(deliberation)}
                        >
                          <Map className="h-4 w-4 mr-2" />
                          Edit Map
                        </Button>
                        
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
                                onClick={() => handleClearMessages(deliberation.id, deliberation.title)}
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
                                This will permanently delete all IBIS nodes, relationships, and ratings from "{deliberation.title}". 
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleClearIbis(deliberation.id, deliberation.title)}
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};