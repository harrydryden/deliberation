import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, MessageSquare } from 'lucide-react';
import { Deliberation } from '@/types/index';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { IbisNodeManagement } from './IbisNodeManagement';
import { AdminIbisMapEditor } from './AdminIbisMapEditor';
import { serviceContainer } from '@/services/domain/container';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';
import { useOptimizedApiCalls } from '@/hooks/useOptimizedApiCalls';
import { DeliberationStats } from './components/DeliberationStats';
import { DeliberationTable } from './components/DeliberationTable';

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
  const adminService = serviceContainer.adminService;
  const { toast } = useToast();
  const { invokeFunction } = useOptimizedApiCalls();

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
      const { execute } = invokeFunction('generate-ibis-roots', {
        deliberationId: deliberation.id,
        deliberationTitle: deliberation.title,
        deliberationDescription: deliberation.description,
        notion: deliberation.notion
      }, {
        cacheKey: `ibis-roots-${deliberation.id}`,
        cacheTTL: 60000
      });

      const rootsData = await execute();

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
            <DeliberationStats deliberations={deliberations} />
            
            <DeliberationTable
              deliberations={deliberations}
              updating={updating}
              clearing={clearing}
              generatingRoots={generatingRoots}
              onStatusUpdate={handleStatusUpdate}
              onEditNodes={handleEditNodes}
              onEditMap={handleEditMap}
              onNotionUpdated={handleNotionUpdated}
              onClearMessages={handleClearMessages}
              onClearIbis={handleClearIbis}
              onGenerateIbisRoots={handleGenerateIbisRoots}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};