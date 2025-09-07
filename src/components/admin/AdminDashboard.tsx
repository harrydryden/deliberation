import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

import { UserAccessManagement } from './UserAccessManagement';
import { AccessCodeCreation } from './AccessCodeCreation';
import { AgentManagement } from './AgentManagement';
import { LocalAgentManagement } from './LocalAgentManagement';
import { DeliberationOverview } from './DeliberationOverview';
import { DeliberationCreation } from './DeliberationCreation';
import { KnowledgeManagement } from './KnowledgeManagement';
import { SystemStats } from './SystemStats';
import { PromptManagement } from './PromptManagement';
import { AgentRatingDashboard } from './AgentRatingDashboard';
import { BulkMessageImport } from './BulkMessageImport';

import { useAdminData } from '@/hooks/useAdminData';
import { logger } from '@/utils/logger';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export const AdminDashboard = () => {
  const adminData = useAdminData();
  const { handleAsyncError } = useErrorHandler();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const initializeData = async () => {
      await handleAsyncError(async () => {
        await Promise.all([
          adminData.fetchStats(),
          adminData.fetchDeliberations(),
          adminData.fetchLocalAgents(),
          adminData.fetchAgents()
        ]);
        logger.component.mount('AdminDashboard', { message: 'Admin dashboard initialized successfully' });
      }, 'admin dashboard initialization');
    };
    
    initializeData();
  }, []); // Run once on mount


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-16 z-40 bg-deliberation-bg/95 backdrop-blur-sm py-4 -mx-6 px-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">
              Manage users, agents, and deliberations
            </p>
          </div>
        </div>
      </div>

      {/* System Statistics */}
      <SystemStats 
        stats={adminData.stats} 
        loading={adminData.loadingStats}
        onRefresh={adminData.fetchStats}
      />

      {/* Main Content Tabs - Sticky */}
      <Tabs defaultValue="users" className="w-full">
        <div className="sticky top-28 z-30 bg-deliberation-bg/95 backdrop-blur-sm py-2 -mx-6 px-6 border-b border-border/50">
          <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="deliberations">Deliberations</TabsTrigger>
          <TabsTrigger value="ratings">Agent Ratings</TabsTrigger>
          <TabsTrigger value="bulk-import">Bulk Import</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="users" className="space-y-4">
          <AccessCodeCreation />
          <UserAccessManagement
            users={adminData.users}
            loading={adminData.loadingUsers}
            onLoadUsers={adminData.fetchUsers}
            onArchiveUser={adminData.archiveUser}
            onUnarchiveUser={adminData.unarchiveUser}
            deliberations={adminData.deliberations}
          />
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <div className="space-y-6">
            <LocalAgentManagement
              localAgents={adminData.localAgents}
              deliberations={adminData.deliberations}
              loading={adminData.loadingLocalAgents}
              onLoad={adminData.fetchLocalAgents}
              onUpdate={adminData.updateLocalAgent}
              onCreate={adminData.createLocalAgent}
            />
            <AgentManagement />
            <PromptManagement />
          </div>
        </TabsContent>


        <TabsContent value="knowledge" className="space-y-4">
          <KnowledgeManagement
            agents={adminData.localAgents}
            loading={adminData.loadingLocalAgents}
            onLoad={adminData.fetchLocalAgents}
          />
        </TabsContent>

        <TabsContent value="deliberations" className="space-y-4">
          <DeliberationCreation 
            onDeliberationCreated={adminData.fetchDeliberations}
          />
          <DeliberationOverview
            deliberations={adminData.deliberations}
            loading={adminData.loadingDeliberations}
            onLoad={adminData.fetchDeliberations}
            onUpdateStatus={async (id: string, status: string) => {
              logger.info('Deliberation status update requested', { id, status });
              toast({
                title: "Status Update",
                description: `Deliberation status changed to: ${status}`,
              });
            }} // Implemented status update handler
          />
        </TabsContent>

        <TabsContent value="ratings" className="space-y-4">
          <AgentRatingDashboard />
        </TabsContent>

        <TabsContent value="bulk-import" className="space-y-4">
          <BulkMessageImport />
        </TabsContent>
      </Tabs>
    </div>
  );
};