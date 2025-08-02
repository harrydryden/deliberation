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
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker with fallback
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.js`;
} catch (error) {
  console.warn('PDF.js worker setup failed:', error);
}

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
      let fileContent = '';
      
      // Extract content based on file type
      if (file.type.startsWith('text/')) {
        fileContent = await file.text();
        setUploadProgress(30);
      } else if (file.type === 'application/pdf') {
        // Extract text from PDF using PDF.js
        try {
          const arrayBuffer = await file.arrayBuffer();
          setUploadProgress(20);
          
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          setUploadProgress(40);
          
          let extractedText = '';
          
          // Extract text from each page
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map((item: any) => item.str)
              .join(' ');
            extractedText += pageText + '\n\n';
            setUploadProgress(40 + (pageNum / pdf.numPages) * 30);
          }
          
          if (extractedText.trim().length < 10) {
            throw new Error('No readable text found in PDF');
          }
          
          fileContent = extractedText.trim();
        } catch (pdfError) {
          console.error('PDF text extraction failed:', pdfError);
          throw new Error(`Failed to extract text from PDF: ${pdfError.message}`);
        }
      } else {
        throw new Error(`Unsupported file type: ${file.type}`);
      }

      setUploadProgress(70);

      // Process the knowledge
      const { data, error } = await supabase.functions.invoke('process-agent-knowledge', {
        body: {
          fileContent,
          fileName: file.name,
          agentId: selectedAgent,
          contentType: file.type
        }
      });

      setUploadProgress(90);

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Processing failed');
      }

      if (data?.success) {
        setUploadProgress(100);
        toast({
          title: "Success",
          description: `Processed ${data.chunksProcessed} knowledge chunks from ${file.name}`
        });
        
        // Reset form
        setSelectedAgent('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        onUploadSuccess?.();
      } else {
        throw new Error(data?.error || 'Processing failed');
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
        {agents && (
          <div className="space-y-2">
            <Label htmlFor="agent-select">Select Agent</Label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an agent..." />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name} ({agent.agent_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="file-upload">Upload Document</Label>
          <Input
            ref={fileInputRef}
            id="file-upload"
            type="file"
            accept=".txt,.pdf,.md"
            onChange={handleFileUpload}
            disabled={uploading || !selectedAgent}
          />
          <p className="text-sm text-muted-foreground">
            Supported formats: PDF, TXT, MD
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