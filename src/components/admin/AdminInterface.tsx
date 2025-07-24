import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentConfigManager } from "./AgentConfigManager";
import { AgentTester } from "./AgentTester";
import { ConfigBackupManager } from "./ConfigBackupManager";
import { KnowledgeManager } from "./KnowledgeManager";
import { Settings, TestTube, Archive, Brain } from "lucide-react";

export const AdminInterface = () => {
  const [activeTab, setActiveTab] = useState("configurations");

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">AI Agent Administration</h1>
        <p className="text-muted-foreground">
          Manage AI agent configurations, test prompts, and backup settings
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="configurations" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Agent Configurations
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="testing" className="flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            Test Prompts
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Backup & Restore
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configurations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agent Configuration Management</CardTitle>
              <CardDescription>
                View and edit system prompts, goals, and response styles for each AI agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentConfigManager />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agent Knowledge Management</CardTitle>
              <CardDescription>
                Add, edit and manage knowledge sources for agents. Upload PDFs or add text content for agents to reference during conversations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <KnowledgeManager />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agent Testing Environment</CardTitle>
              <CardDescription>
                Test agent prompts with sample inputs before deploying changes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentTester />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuration Backup & Restore</CardTitle>
              <CardDescription>
                Create backups of current configurations and restore previous versions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigBackupManager />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};