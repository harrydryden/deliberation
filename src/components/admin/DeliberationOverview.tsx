import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RefreshCw, MessageSquare, Eye, GitBranch, Trash2, Database, Map, Edit, Lightbulb } from 'lucide-react';
import { formatToUKDateTime } from '@/utils/timeUtils';
import { Deliberation } from '@/types/index';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ExpandableText } from '@/components/common/ExpandableText';
import { useNavigate } from 'react-router-dom';
import { IbisNodeManagement } from './IbisNodeManagement';
import { AdminIbisMapEditor } from './AdminIbisMapEditor';
import { NotionEditor } from './NotionEditor';
import { serviceContainer } from '@/services/domain/container';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';
import { supabase } from '@/integrations/supabase/client';

interface DeliberationOverviewProps {
  deliberations: Deliberation[];
  loading: boolean;
  onLoad: () => void;
  onUpdateStatus: (id: string, status: string) => void;
}

export const DeliberationOverview = ({ deliberations: initialDeliberations, loading, onLoad, onUpdateStatus }: DeliberationOverviewProps) => {
  logger.component.mount('DeliberationOverview', { deliberationCount: initialDeliberations.length });
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedDeliberation, setSelectedDeliberation] = useState<Deliberation | null>(null);
  const [editMode, setEditMode] = useState<'nodes' | 'map' | null>(null);
  const [clearing, setClearing] = useState<{ [key: string]: 'messages' | 'ibis' | null }>({});
  const [deliberations, setDeliberations] = useState(initialDeliberations);
  const [generatingRoots, setGeneratingRoots] = useState<string | null>(null);
  const navigate = useNavigate();
  const adminService = serviceContainer.adminService;
  const { toast } = useToast();

  useEffect(() => {
    setDeliberations(initialDeliberations);
  }, [initialDeliberations]);

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
    logger.info('Edit Nodes clicked for deliberation', { deliberationId: deliberation.id, title: deliberation.title });
    setSelectedDeliberation(deliberation);
    setEditMode('nodes');
    logger.debug('State set, editMode should now be "nodes"');
  };

  const handleEditMap = (deliberation: Deliberation) => {
    logger.info('Edit Map clicked for deliberation', { deliberationId: deliberation.id, title: deliberation.title });
    setSelectedDeliberation(deliberation);
    setEditMode('map');
    logger.debug('State set, editMode should now be "map"');
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
      logger.error('Failed to clear messages', error as Error, { deliberationId });
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
      logger.error('Failed to clear IBIS data', error as Error, { deliberationId });
      toast({
        title: "Error",
        description: "Failed to clear IBIS data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setClearing(prev => ({ ...prev, [deliberationId]: null }));
    }
  };

  const handleNotionUpdated = (deliberationId: string, newNotion: string) => {
    setDeliberations(prev => prev.map(d => 
      d.id === deliberationId ? { ...d, notion: newNotion } : d
    ));
  };

  const handleGenerateIbisRoots = async (deliberation: Deliberation) => {
    setGeneratingRoots(deliberation.id);
    try {
      const { data: rootsData, error: rootsError } = await supabase.functions.invoke('generate-ibis-roots', {
        body: {
          deliberationId: deliberation.id,
          deliberationTitle: deliberation.title,
          deliberationDescription: deliberation.description,
          notion: deliberation.notion
        }
      });

      if (rootsError) {
        throw rootsError;
      }

      toast({
        title: "IBIS Roots Generated",
        description: `Generated ${rootsData?.count || 0} root issues for "${deliberation.title}"`
      });
    } catch (error) {
      logger.error('Failed to generate IBIS roots', error as Error, { deliberationId: deliberation.id });
      toast({
        title: "Error",
        description: "Failed to generate IBIS roots. Please try again.",
        variant: "destructive"
      });
    } finally {
      setGeneratingRoots(null);
    }
  };

  logger.debug('Render check', {
    selectedDeliberation: selectedDeliberation?.id,
    editMode,
    shouldRenderNodes: selectedDeliberation && editMode === 'nodes',
    shouldRenderMap: selectedDeliberation && editMode === 'map'
  });

  if (selectedDeliberation && editMode === 'nodes') {
    logger.debug('Rendering IbisNodeManagement');
    try {
      return (
        <IbisNodeManagement
          deliberationId={selectedDeliberation.id}
          deliberationTitle={selectedDeliberation.title}
          onBack={handleBackFromEdit}
        />
      );
    } catch (error) {
      logger.error('Error rendering IbisNodeManagement', error as Error);
      return <div>Error loading node management</div>;
    }
  }

  if (selectedDeliberation && editMode === 'map') {
    logger.debug('Rendering AdminIbisMapEditor', {
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
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Title</TableHead>
                    <TableHead className="w-[140px]">Status</TableHead>
                    <TableHead className="min-w-[250px]">Notion</TableHead>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    <TableHead className="w-[120px]">Created</TableHead>
                    <TableHead className="w-[120px]">Updated</TableHead>
                    <TableHead className="min-w-[500px]">Actions</TableHead>
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
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateIbisRoots(deliberation)}
                          disabled={generatingRoots === deliberation.id}
                        >
                          <Lightbulb className="h-4 w-4 mr-2" />
                          {generatingRoots === deliberation.id ? 'Generating...' : 'Generate IBIS Roots'}
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
                              onNotionUpdated={(newNotion) => handleNotionUpdated(deliberation.id, newNotion)}
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
          </div>
        )}
      </CardContent>
    </Card>
  );
};