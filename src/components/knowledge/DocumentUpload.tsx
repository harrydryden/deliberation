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
import { Agent } from '@/types/api';

// Remove PDF.js imports since we're using server-side processing

interface DocumentUploadProps {
  agents?: Agent[];
  onUploadSuccess?: () => void;
}

export function DocumentUpload({ agents, onUploadSuccess }: DocumentUploadProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      setUploadProgress(10);

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      
      console.log('Uploading file to storage:', fileName);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      setUploadProgress(50);
      console.log('File uploaded successfully:', uploadData.path);

      // Try LangChain processing first, fallback to original if needed
      let processingData, processingError;
      
      try {
        const result = await supabase.functions.invoke('langchain-process-document', {
          body: {
            agentId: selectedAgent,
            storagePath: uploadData.path,
            fileName: file.name,
            contentType: fileExt === 'pdf' ? 'pdf' : 'text'
          }
        });
        
        processingData = result.data;
        processingError = result.error;
        
        console.log('LangChain processing result:', { data: processingData, error: processingError });
      } catch (langchainError) {
        console.log('LangChain processing failed, trying original function...', langchainError);
        
        // Fallback to original processing function
        const result = await supabase.functions.invoke('process-document', {
          body: {
            agentId: selectedAgent,
            storagePath: uploadData.path,
            fileName: file.name,
            contentType: file.type
          }
        });
        
        processingData = result.data;
        processingError = result.error;
      }

      setUploadProgress(70);

      if (processingError) {
        console.error('Processing error:', processingError);
        // Clean up uploaded file on processing error
        await supabase.storage.from('documents').remove([uploadData.path]);
        throw new Error(processingError.message || 'Processing failed');
      }

      if (processingData?.success) {
        setUploadProgress(100);
        const processingMethod = processingData.langchainProcessed ? 'LangChain' : 'Standard';
        toast({
          title: "Success",
          description: `Successfully uploaded and processed ${file.name} using ${processingMethod}. Created ${processingData.chunksProcessed} knowledge chunks.`
        });
        
        // Reset form
        setSelectedAgent('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        onUploadSuccess?.();
      } else {
        // Clean up uploaded file on processing failure
        await supabase.storage.from('documents').remove([uploadData.path]);
        throw new Error(processingData?.error || 'Processing failed');
      }
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
            Supported formats: PDF, TXT, MD (with server-side processing)
          </p>
        </div>

        {uploading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Processing document...</span>
            </div>
            <Progress value={uploadProgress} className="w-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}