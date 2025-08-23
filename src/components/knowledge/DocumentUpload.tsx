import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Agent } from '@/types/index';
import { logger } from '@/utils/logger';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';

interface DocumentUploadProps {
  agents?: Agent[];
  onUploadSuccess?: () => void;
}

export function DocumentUpload({ agents, onUploadSuccess }: DocumentUploadProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [performanceStats, setPerformanceStats] = useState<{
    chunksProcessed: number;
    batchesProcessed: number;
    processingTime: number;
    optimized: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Check if current user is admin
  const { user, isAdmin } = useSupabaseAuth();

  // Only show component to admins
  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-8 text-muted-foreground">
            <Upload className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Admin Access Required</p>
            <p className="text-sm">Only administrators can upload knowledge documents.</p>
            <p className="text-sm mt-2">Users can access knowledge through the Bill agent during conversations.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedAgent) {
      toast({
        title: "Error",
        description: "Please select an agent and choose a file",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setProcessingStatus('Uploading file to secure storage...');
    setPerformanceStats(null);
    const startTime = performance.now();

    try {
      // User is already available from hook
      if (!user) {
        throw new Error('User not authenticated');
      }

      setUploadProgress(25);

      // Upload file to storage first - no client-side processing
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      
      logger.component.update('DocumentUpload', { action: 'uploadStart', fileName });
      
      console.log('Uploading file to storage:', fileName);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      setUploadProgress(50);
      setProcessingStatus('Processing document with server-side AI (PDF parsing, OpenAI embeddings, langchain)...');
      logger.component.update('DocumentUpload', { action: 'uploadSuccess', path: uploadData.path });

      // Server-side processing - handles PDF parsing, OpenAI, and langchain
      const { data: processResult, error: processError } = await supabase.functions.invoke(
        'secure-file-processor',
        {
          body: {
            storagePath: uploadData.path,
            fileName: file.name,
            agentId: selectedAgent,
            contentType: file.type.includes('pdf') ? 'pdf' : 'text'
          }
        }
      );

      if (processError || !processResult?.success) {
        console.error('Processing error:', processError || processResult);
        throw new Error(processResult?.error || 'Failed to process document on server');
      }
      
      setUploadProgress(100);
      setProcessingStatus('Processing completed successfully!');
      
      // Set performance stats
      const totalTime = performance.now() - startTime;
      setPerformanceStats({
        chunksProcessed: processResult.chunksProcessed || 0,
        batchesProcessed: Math.ceil((processResult.chunksProcessed || 0) / 20),
        processingTime: totalTime,
        optimized: true
      });
      
      toast({
        title: "Success", 
        description: `Successfully processed ${file.name} using server-side AI. Created ${processResult.chunksProcessed || 0} knowledge chunks in ${(totalTime/1000).toFixed(1)}s.`
      });
      
      // Reset form
      setSelectedAgent('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      onUploadSuccess?.();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: `Failed to process file: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {agents && agents.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="agent-select">Select Local Agent</Label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a local agent..." />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name} ({agent.agent_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Only local agents (specific to deliberations) can receive knowledge uploads.
            </p>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No local agents available.</p>
            <p className="text-sm">Knowledge can only be uploaded to local agents created for specific deliberations.</p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="file-upload">Upload Document</Label>
          <Input
            ref={fileInputRef}
            id="file-upload"
            type="file"
            accept=".txt,.md,.pdf"
            onChange={handleFileUpload}
            disabled={uploading || !selectedAgent || !agents || agents.length === 0}
          />
          <p className="text-sm text-muted-foreground">
            Supported formats: PDF, TXT, MD (secure server-side processing with PDF parsing, OpenAI embeddings, and langchain)
          </p>
        </div>

        {uploading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">Processing document...</span>
            </div>
            <Progress value={uploadProgress} className="w-full" />
            {processingStatus && (
              <p className="text-sm text-muted-foreground">{processingStatus}</p>
            )}
          </div>
        )}

        {performanceStats && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
              ⚡ Performance Stats
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Chunks:</span>
                <span className="ml-1 font-medium">{performanceStats.chunksProcessed}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Batches:</span>
                <span className="ml-1 font-medium">{performanceStats.batchesProcessed}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Time:</span>
                <span className="ml-1 font-medium">{(performanceStats.processingTime / 1000).toFixed(1)}s</span>
              </div>
              <div>
                <span className="text-muted-foreground">Method:</span>
                <span className="ml-1 font-medium">Server-side AI</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}