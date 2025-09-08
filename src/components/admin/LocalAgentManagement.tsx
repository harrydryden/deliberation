import { useEffect, useState } from 'react';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Bot, ExternalLink } from 'lucide-react';
import { formatToUKDateTime } from '@/utils/timeUtils';
import { Agent, Deliberation, LocalAgentCreate } from '@/types/index';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { LocalAgentCreationModal } from './LocalAgentCreationModal';
import { LocalAgentEditModal } from './LocalAgentEditModal';
import { SystemPromptPreview } from './SystemPromptPreview';
import { logger } from '@/utils/logger';

interface LocalAgentManagementProps {
  localAgents: Agent[];
  deliberations: Deliberation[];
  loading: boolean;
  onLoad: () => void;
  onUpdate: (id: string, config: Partial<Agent>) => void;
  onCreate: (config: LocalAgentCreate) => void;
}

export const LocalAgentManagement = ({ localAgents, deliberations, loading, onLoad, onUpdate, onCreate }: LocalAgentManagementProps) => {
  // Add null checks to prevent runtime errors
  const safeLocalAgents = localAgents || [];
  const safeDeliberations = deliberations || [];
  const [updating, setUpdating] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!hasLoaded && !loading) {
      logger.component.mount('LocalAgentManagement', { action: 'initialLoad' });
      onLoad();
      setHasLoaded(true);
    }
  }, [hasLoaded, loading, onLoad]);

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    setUpdating(id);
    try {
      await onUpdate(id, { is_active: !currentStatus });
    } finally {
      setUpdating(null);
    }
  };

  const handleRefresh = () => {
    logger.component.update('LocalAgentManagement', { action: 'manualRefresh' });
    onLoad();
  };

  const getAgentTypeBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      'bill_agent': 'default',
      'peer_agent': 'secondary',
      'flow_agent': 'destructive',
    };
    return <Badge variant={variants[type] || 'secondary'}>{type.replace('_', ' ')}</Badge>;
  };

  const getStatusBadge = (isActive: boolean) => {
    return (
      <Badge variant={isActive ? 'default' : 'secondary'}>
        {isActive ? 'Active' : 'Inactive'}
      </Badge>
    );
  };

  const getDeliberationStatusBadge = (status?: string) => {
    if (!status) return null;
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Local Agent Management</CardTitle>  
              <CardDescription>
                Deliberation-specific agents with customizable prompts and settings.
              </CardDescription>
            </div>
        <div className="flex gap-2">
          <LocalAgentCreationModal
            deliberations={safeDeliberations}
            onCreateAgent={onCreate}
            loading={loading}
          />
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && safeLocalAgents.length === 0 ? (
          <LoadingSpinner />
        ) : safeLocalAgents.length === 0 ? (
          <div className="text-center py-8">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No local agents found</p>
            <p className="text-sm text-muted-foreground mt-2">
              Local agents are created automatically when deliberations begin
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{safeLocalAgents.length}</div>
                <div className="text-sm text-muted-foreground">Total Local</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {safeLocalAgents.filter(a => a.is_active).length}
                </div>
                <div className="text-sm text-muted-foreground">Active</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {safeLocalAgents.filter(a => a.deliberation?.status === 'active').length}
                </div>
                <div className="text-sm text-muted-foreground">In Active Deliberations</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {new Set(safeLocalAgents.map(a => a.deliberation?.id)).size}
                </div>
                <div className="text-sm text-muted-foreground">Deliberations</div>
              </div>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deliberation</TableHead>
                  <TableHead>Deliberation Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Prompts</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeLocalAgents.map((agent) => (
                  <React.Fragment key={agent.id}>
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">
                        <div>
                          <div className="font-semibold">{agent.name}</div>
                          {agent.description && (
                            <div className="text-sm text-muted-foreground truncate max-w-xs">
                              {agent.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getAgentTypeBadge(agent.agent_type)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(agent.is_active)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{agent.deliberation?.title || 'Unknown'}</span>
                          {agent.deliberation && (
                            <Button variant="ghost" size="sm" asChild>
                              <a 
                                href={`/deliberations/${agent.deliberation.id}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getDeliberationStatusBadge(agent.deliberation?.status)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(agent.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {agent.prompt_overrides?.system_prompt ? (
                            <Badge variant="secondary" className="text-xs">
                              System Override
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Auto-Generated
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <LocalAgentEditModal
                            agent={agent}
                            onUpdateAgent={onUpdate}
                            loading={updating === agent.id}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleActive(agent.id, agent.is_active)}
                            disabled={updating === agent.id}
                          >
                            {updating === agent.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              agent.is_active ? 'Deactivate' : 'Activate'
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow key={`${agent.id}-prompt`}>
                      <TableCell colSpan={8} className="p-0">
                        <div className="px-6 pb-4">
                          <SystemPromptPreview agent={agent} />
                        </div>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};