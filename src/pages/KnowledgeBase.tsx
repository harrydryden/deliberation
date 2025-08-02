import React, { useEffect, useState } from 'react';
import { DocumentUpload } from '@/components/knowledge/DocumentUpload';
import { RAGChat } from '@/components/knowledge/RAGChat';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminService } from '@/hooks/useAdminService';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export function KnowledgeBase() {
  const { agents, loading, fetchAgents } = useAdminService();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents, refreshKey]);

  const handleUploadSuccess = () => {
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Knowledge Base</h1>
      
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chat">Ask Questions</TabsTrigger>
          <TabsTrigger value="upload">Upload Documents</TabsTrigger>
        </TabsList>
        
        <TabsContent value="chat">
          <RAGChat agents={agents} />
        </TabsContent>
        
        <TabsContent value="upload">
          <DocumentUpload agents={agents} onUploadSuccess={handleUploadSuccess} />
        </TabsContent>
      </Tabs>
    </div>
  );
}