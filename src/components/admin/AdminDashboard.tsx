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
import { BulkUserCreation } from './BulkUserCreation';
import { PromptManagement } from './PromptManagement';

import { useAdminData } from '@/hooks/useAdminData';
import { useMemoryLeakDetection } from '@/utils/performanceUtils';
import { logger } from '@/utils/logger';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export const AdminDashboard = () => {
  const adminData = useAdminData();
  const { handleAsyncError } = useErrorHandler();
  const navigate = useNavigate();
  
  useMemoryLeakDetection('AdminDashboard');

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
          <TabsTrigger value="prompts">Prompt Templates</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="deliberations">Deliberations</TabsTrigger>
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
            <div>
              <h3 className="text-lg font-semibold mb-4">Global Agent Templates</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Manage reusable agent configurations. System prompts are now managed via the "Prompt Templates" tab above.
              </p>
              <AgentManagement />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Local Agents (Deliberation-Specific)</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Deliberation-specific agent instances. System prompts inherit from templates or can be overridden per agent.
              </p>
              <LocalAgentManagement
                localAgents={adminData.localAgents}
                deliberations={adminData.deliberations}
                loading={adminData.loadingLocalAgents}
                onLoad={adminData.fetchLocalAgents}
                onUpdate={adminData.updateLocalAgent}
                onCreate={adminData.createLocalAgent}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="prompts" className="space-y-4">
          <PromptManagement />
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
            onUpdateStatus={async () => {}} // TODO: implement
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};