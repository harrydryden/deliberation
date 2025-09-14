import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MessageSquare, Eye, GitBranch, Map, Edit } from 'lucide-react';
import { Deliberation } from '@/types/index';
import { useNavigate } from 'react-router-dom';
import { IbisNodeManagement } from '../IbisNodeManagement';
import { AdminIbisMapEditor } from '../AdminIbisMapEditor';
import { NotionEditor } from '../NotionEditor';
import { serviceContainer } from '@/services/domain/container';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface DeliberationActionsMenuProps {
  deliberation: Deliberation;
}

export const DeliberationActionsMenu = ({ 
  deliberation
}: DeliberationActionsMenuProps) => {
  const [selectedDeliberation, setSelectedDeliberation] = useState<Deliberation | null>(null);
  const [editMode, setEditMode] = useState<'nodes' | 'map' | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleViewDeliberation = () => {
    navigate(`/deliberations/${deliberation.id}`);
  };

  const handleEditNodes = (delib: Deliberation) => {
    setSelectedDeliberation(delib);
    setEditMode('nodes');
  };

  const handleEditMap = (delib: Deliberation) => {
    setSelectedDeliberation(delib);
    setEditMode('map');
  };

  const handleBackFromEdit = () => {
    setSelectedDeliberation(null);
    setEditMode(null);
  };

  const renderEditContent = () => {
    if (!selectedDeliberation || !editMode) return null;

    if (editMode === 'nodes') {
      return (
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Manage IBIS Nodes - {selectedDeliberation.title}</DialogTitle>
              <Button variant="outline" onClick={handleBackFromEdit}>
                Back to Overview
              </Button>
            </div>
          </DialogHeader>
            <IbisNodeManagement 
              deliberationId={selectedDeliberation.id}
              deliberationTitle={selectedDeliberation.title}
              onBack={handleBackFromEdit}
            />
        </DialogContent>
      );
    }

    if (editMode === 'map') {
      return (
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>IBIS Map Editor - {selectedDeliberation.title}</DialogTitle>
              <Button variant="outline" onClick={handleBackFromEdit}>
                Back to Overview
              </Button>
            </div>
          </DialogHeader>
          <div className="h-[70vh] w-full">
            <AdminIbisMapEditor 
              deliberationId={selectedDeliberation.id}
              deliberationTitle={selectedDeliberation.title}
              onBack={handleBackFromEdit}
            />
          </div>
        </DialogContent>
      );
    }

    return null;
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleViewDeliberation}
        >
          <Eye className="w-4 h-4 mr-1" />
          View
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => handleEditNodes(deliberation)}>
              <GitBranch className="w-4 h-4 mr-1" />
              Edit Nodes
            </Button>
          </DialogTrigger>
          {editMode === 'nodes' && renderEditContent()}
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => handleEditMap(deliberation)}>
              <Map className="w-4 h-4 mr-1" />
              Edit Map
            </Button>
          </DialogTrigger>
          {editMode === 'map' && renderEditContent()}
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Edit className="w-4 h-4 mr-1" />
              Edit Notion
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Notion Statement - {deliberation.title}</DialogTitle>
            </DialogHeader>
            <NotionEditor 
              deliberationId={deliberation.id}
              currentNotion={deliberation.notion || ''}
              onNotionUpdated={(newNotion) => {
                // Handle notion update - could refresh deliberations or update local state
                // Production-safe logging
                if (((import.meta as any)?.env?.MODE ?? (typeof process !== 'undefined' ? process.env.NODE_ENV : 'development')) === 'development') {
                  logger.info('Notion updated successfully');
                }
              }}
              deliberationTitle={deliberation.title}
            />
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};