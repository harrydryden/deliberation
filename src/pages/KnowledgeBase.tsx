import React, { useState } from 'react';
import { DocumentUpload } from '@/components/knowledge/DocumentUpload';
import { RAGChat } from '@/components/knowledge/RAGChat';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useUserAgents } from '@/hooks/useUserAgents';
import { Users, AlertCircle } from 'lucide-react';

export function KnowledgeBase() {
  const { localAgents, loading, refetch } = useUserAgents();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshKey(prev => prev + 1);
    refetch();
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (localAgents.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">Knowledge Base</h1>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              No Knowledge Agents Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Join a Deliberation First</h3>
              <p className="mb-4">
                Knowledge features are only available for agents within deliberations you're participating in.
              </p>
              <p className="text-sm">
                To access knowledge agents, join an active deliberation where local agents have been configured.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Knowledge Base</h1>
      <p className="text-muted-foreground mb-6">
        Interact with knowledge agents from deliberations you're participating in.
      </p>
      
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chat">Ask Questions</TabsTrigger>
          <TabsTrigger value="upload">Upload Documents</TabsTrigger>
        </TabsList>
        
        <TabsContent value="chat">
          <RAGChat agents={localAgents} />
        </TabsContent>
        
        <TabsContent value="upload">
          <DocumentUpload agents={localAgents} onUploadSuccess={handleUploadSuccess} />
        </TabsContent>
      </Tabs>
    </div>
  );
}