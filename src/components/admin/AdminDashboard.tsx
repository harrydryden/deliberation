import { useState, useEffect } from 'react';
import { Tabs } from '@/components/ui/tabs';

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


// Import optimized components and hooks
import { AdminHeader } from './components/AdminHeader';
import { AdminTabNavigation } from './components/AdminTabNavigation';
import { AdminTabContent } from './components/AdminTabContent';
import { useOptimizedAdminData } from '@/hooks/useOptimizedAdminData';
import { AdminErrorBoundary } from '@/components/error-boundaries/AdminErrorBoundary';
import { logger } from '@/utils/logger';
import { useErrorHandler } from '@/hooks/useErrorHandler';

export const AdminDashboard = () => {
  const adminData = useOptimizedAdminData();
  const { handleAsyncError } = useErrorHandler();

  useEffect(() => {
    const initializeData = async () => {
      await handleAsyncError(async () => {
        await Promise.all([
          adminData.fetchStats(),
          adminData.fetchDeliberations(),
          adminData.fetchLocalAgents(),
          adminData.fetchAgents(),
          adminData.fetchUsers()
        ]);
        logger.component.mount('AdminDashboard', { message: 'Admin dashboard initialized successfully' });
      }, 'admin dashboard initialization');
    };
    
    initializeData();
  }, []); // Run once on mount

  return (
    <AdminErrorBoundary>
      <div className="space-y-6">
        <AdminHeader />

        {/* System Statistics */}
        <SystemStats 
          stats={adminData.stats} 
          loading={adminData.loadingStats}
          onRefresh={adminData.fetchStats}
        />

        {/* Main Content Tabs */}
        <Tabs defaultValue="users" className="w-full">
          <AdminTabNavigation />

          <AdminTabContent value="users">
            <AccessCodeCreation />
            <UserAccessManagement
              users={adminData.users}
              loading={adminData.loadingUsers}
              onLoadUsers={adminData.fetchUsers}
              onArchiveUser={adminData.archiveUser}
              onUnarchiveUser={adminData.unarchiveUser}
              deliberations={adminData.deliberations}
            />
          </AdminTabContent>

          <AdminTabContent value="agents">
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
          </AdminTabContent>

          <AdminTabContent value="knowledge">
            <KnowledgeManagement 
              agents={adminData.localAgents}
              loading={adminData.loadingLocalAgents}
              onLoad={adminData.fetchLocalAgents}
            />
          </AdminTabContent>

          <AdminTabContent value="deliberations">
            <div className="space-y-6">
              <DeliberationCreation 
                onDeliberationCreated={adminData.fetchDeliberations}
              />
              <DeliberationOverview
                deliberations={adminData.deliberations}
                loading={adminData.loadingDeliberations}
                onLoad={adminData.fetchDeliberations}
                onUpdateStatus={adminData.updateDeliberationStatus}
              />
            </div>
          </AdminTabContent>

          <AdminTabContent value="ratings">
            <AgentRatingDashboard />
          </AdminTabContent>

        </Tabs>
      </div>
    </AdminErrorBoundary>
  );
};