import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BACKEND_CONFIG } from '@/config/backend';
import { UserManagement } from './UserManagement';
import { AccessCodeManagement } from './AccessCodeManagement';
import { AgentManagement } from './AgentManagement';
import { LocalAgentManagement } from './LocalAgentManagement';
import { DeliberationOverview } from './DeliberationOverview';
import { DeliberationCreation } from './DeliberationCreation';
import { KnowledgeManagement } from './KnowledgeManagement';
import { SystemStats } from './SystemStats';
import { useAdminService } from '@/hooks/useAdminService';

export const AdminDashboard = () => {
  const [currentBackend, setCurrentBackend] = useState(BACKEND_CONFIG.type);
  const adminService = useAdminService();

  useEffect(() => {
    // Load initial data
    adminService.fetchStats();
  }, []);

  const handleBackendToggle = (checked: boolean) => {
    const newBackend = checked ? 'nodejs' : 'supabase';
    setCurrentBackend(newBackend);
    
    // In a real implementation, you'd need to:
    // 1. Update environment variables
    // 2. Reload the page or reinitialize services
    // For now, just show a message
    alert(`To switch to ${newBackend}, please update your environment variables:\n\nVITE_BACKEND_TYPE=${newBackend}\n\nThen reload the page.`);
  };

  return (
    <div className="space-y-6">
      {/* Header with Backend Toggle */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Manage users, access codes, agents, and deliberations
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="backend-toggle">Backend:</Label>
            <Badge variant={currentBackend === 'supabase' ? 'default' : 'secondary'}>
              Supabase
            </Badge>
            <Switch
              id="backend-toggle"
              checked={currentBackend === 'nodejs'}
              onCheckedChange={handleBackendToggle}
            />
            <Badge variant={currentBackend === 'nodejs' ? 'default' : 'secondary'}>
              Node.js
            </Badge>
          </div>
        </div>
      </div>

      {/* System Statistics */}
      <SystemStats 
        stats={adminService.stats} 
        loading={adminService.loadingStats}
        onRefresh={adminService.fetchStats}
      />

      {/* Main Content Tabs */}
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="access-codes">Access Codes</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="deliberations">Deliberations</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <UserManagement
            users={adminService.users}
            loading={adminService.loadingUsers}
            onLoad={adminService.fetchUsers}
            onUpdateRole={adminService.updateUserRole}
            onDelete={adminService.deleteUser}
          />
        </TabsContent>

        <TabsContent value="access-codes" className="space-y-4">
          <AccessCodeManagement
            accessCodes={adminService.accessCodes}
            loading={adminService.loadingAccessCodes}
            onLoad={adminService.fetchAccessCodes}
            onCreate={adminService.createAccessCode}
            onDelete={adminService.deleteAccessCode}
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
                loading={adminService.loadingLocalAgents}
                onLoad={adminService.fetchLocalAgents}
                onUpdate={adminService.updateAgent}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <KnowledgeManagement
            agents={adminService.agents}
            loading={adminService.loadingAgents}
            onLoad={adminService.fetchAgents}
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