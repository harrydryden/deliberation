import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import { UserAccessManagement } from './UserAccessManagement';
import { AgentManagement } from './AgentManagement';
import { LocalAgentManagement } from './LocalAgentManagement';
import { DeliberationOverview } from './DeliberationOverview';
import { DeliberationCreation } from './DeliberationCreation';
import { KnowledgeManagement } from './KnowledgeManagement';
import { SystemStats } from './SystemStats';
import { useAdminService } from '@/hooks/useAdminService';
import { useMemoryLeakDetection } from '@/utils/performanceUtils';
import { logger } from '@/utils/logger';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export const AdminDashboard = () => {
  const adminService = useAdminService();
  const { handleAsyncError } = useErrorHandler();
  const navigate = useNavigate();
  
  useMemoryLeakDetection('AdminDashboard');

  useEffect(() => {
    const initializeData = async () => {
      await handleAsyncError(async () => {
        await Promise.all([
          adminService.fetchStats(),
          adminService.fetchDeliberations()
        ]);
        logger.component.mount('AdminDashboard', { message: 'Admin dashboard initialized successfully' });
      }, 'admin dashboard initialization');
    };
    
    initializeData();
  }, [handleAsyncError]);


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
        stats={adminService.stats} 
        loading={adminService.loadingStats}
        onRefresh={adminService.fetchStats}
      />

      {/* Main Content Tabs - Sticky */}
      <Tabs defaultValue="users" className="w-full">
        <div className="sticky top-32 z-30 bg-deliberation-bg/95 backdrop-blur-sm py-2 -mx-6 px-6">
          <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">Users & Access</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="deliberations">Deliberations</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="users" className="space-y-4">
          <UserAccessManagement
            users={adminService.users}
            accessCodes={adminService.accessCodes}
            loading={adminService.loadingUsers}
            loadingAccessCodes={adminService.loadingAccessCodes}
            onLoadUsers={adminService.fetchUsers}
            onLoadAccessCodes={adminService.fetchAccessCodes}
            onUpdateRole={adminService.updateUserRole}
            onDeleteUser={adminService.deleteUser}
            onCreateAccessCode={adminService.createAccessCode}
            onDeleteAccessCode={adminService.deleteAccessCode}
          />
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Global Agent Templates</h3>
              <AgentManagement
                agents={adminService.agents}
                loading={adminService.loadingAgents}
                onLoad={adminService.fetchAgents}
                onUpdate={adminService.updateAgent}
                onCreate={adminService.createAgent}
              />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Local Agents (Deliberation-Specific)</h3>
              <LocalAgentManagement
                localAgents={adminService.localAgents}
                deliberations={adminService.deliberations}
                loading={adminService.loadingLocalAgents}
                onLoad={adminService.fetchLocalAgents}
                onUpdate={adminService.updateAgent}
                onCreate={adminService.createLocalAgent}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <KnowledgeManagement
            agents={adminService.localAgents}
            loading={adminService.loadingLocalAgents}
            onLoad={adminService.fetchLocalAgents}
          />
        </TabsContent>

        <TabsContent value="deliberations" className="space-y-4">
          <DeliberationCreation 
            onDeliberationCreated={adminService.fetchDeliberations}
          />
          <DeliberationOverview
            deliberations={adminService.deliberations}
            loading={adminService.loadingDeliberations}
            onLoad={adminService.fetchDeliberations}
            onUpdateStatus={adminService.updateDeliberationStatus}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};