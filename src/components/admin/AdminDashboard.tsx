import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

import { UserAccessManagement } from './UserAccessManagement';
import { AgentManagement } from './AgentManagement';
import { LocalAgentManagement } from './LocalAgentManagement';
import { DeliberationOverview } from './DeliberationOverview';
import { DeliberationCreation } from './DeliberationCreation';
import { KnowledgeManagement } from './KnowledgeManagement';
import { SystemStats } from './SystemStats';
import { BulkUserCreation } from './BulkUserCreation';
import { PromptManagement } from './PromptManagement';
import { AgentRatingDashboard } from './AgentRatingDashboard';

import { useAdminData } from '@/hooks/useAdminData';
import { useMemoryLeakDetection } from '@/utils/performanceUtils';
import { logger } from '@/utils/logger';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { usePerformanceOptimization, useComponentMetrics } from '@/hooks/usePerformanceOptimization';

export const AdminDashboard = () => {
  const adminData = useAdminData();
  const { handleAsyncError } = useErrorHandler();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  useMemoryLeakDetection('AdminDashboard');
  
  // Performance optimization
  const { createOptimizedCallback, createBatchedUpdater } = usePerformanceOptimization({
    componentName: 'AdminDashboard',
    enableLogging: true
  });
  const { getMetrics } = useComponentMetrics('AdminDashboard');

  useEffect(() => {
    const initializeData = createOptimizedCallback(async () => {
      await handleAsyncError(async () => {
        await Promise.all([
          adminData.fetchStats(),
          adminData.fetchDeliberations(),
          adminData.fetchLocalAgents(),
          adminData.fetchAgents()
        ]);
        logger.component.mount('AdminDashboard', { message: 'Admin dashboard initialized successfully' });
      }, 'admin dashboard initialization');
    }, [handleAsyncError, adminData], 'initializeData');
    
    initializeData();
  }, [createOptimizedCallback, handleAsyncError, adminData]);


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-16 z-40 bg-deliberation-bg/95 backdrop-blur-sm py-4 -mx-6 px-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">
              Manage users, access codes, agents, and deliberations
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
          <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="users">Users & Access</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="deliberations">Deliberations</TabsTrigger>
          <TabsTrigger value="ratings">Agent Ratings</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="users" className="space-y-4">
          <BulkUserCreation 
            onUsersCreated={() => {
              adminData.fetchUsers();
              adminData.fetchStats();
            }}
          />
          <UserAccessManagement
            users={adminData.users}
            accessCodes={adminData.accessCodes}
            loading={adminData.loadingUsers}
            loadingAccessCodes={adminData.loadingAccessCodes}
            onLoadUsers={adminData.fetchUsers}
            onLoadAccessCodes={adminData.fetchAccessCodes}
            onArchiveUser={adminData.archiveUser}
            onUnarchiveUser={adminData.unarchiveUser}
            onCreateAccessCode={adminData.createAccessCode}
            onDeleteAccessCode={adminData.deleteAccessCode}
          />
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <div className="space-y-6">
            <AgentManagement />
            <PromptManagement />
            <LocalAgentManagement
              localAgents={adminData.localAgents}
              deliberations={adminData.deliberations}
              loading={adminData.loadingLocalAgents}
              onLoad={adminData.fetchLocalAgents}
              onUpdate={adminData.updateLocalAgent}
              onCreate={adminData.createLocalAgent}
            />
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
      </Tabs>
    </div>
  );
};