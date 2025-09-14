import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileText, Brain, Trash2, Search, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatToUKDate } from '@/utils/timeUtils';
import { supabase } from '@/integrations/supabase/client';
import { Agent } from '@/types/index';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { logger } from '@/utils/logger';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  content_type: string;
  file_name: string;
  chunk_index: number;
  created_at: string;
  agent_id: string;
}

interface KnowledgeManagementProps {
  agents: Agent[];
  loading: boolean;
  onLoad: () => void;
}

export const KnowledgeManagement = ({ agents, loading, onLoad }: KnowledgeManagementProps) => {
  // Add null check to prevent runtime errors
  const safeAgents = agents || [];
  
  logger.component.mount('KnowledgeManagement', { agentCount: safeAgents.length, loading });
  
  const { user } = useSupabaseAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [queryOpen, setQueryOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [query, setQuery] = useState('');
  const [queryResults, setQueryResults] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const loadKnowledgeForAgent = async (agentId: string) => {
    if (!agentId) return;
    
    setLoadingKnowledge(true);
    try {
      const { data, error } = await supabase
        .from('agent_knowledge')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setKnowledgeItems(data || []);
    } catch (error) {
      logger.error('Error loading knowledge:', error);
      toast({
        title: "Error",
        description: "Failed to load agent knowledge",
        variant: "destructive"
      });
    } finally {
      setLoadingKnowledge(false);
    }
  };

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
    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      
      logger.component.update('KnowledgeManagement', { action: 'uploadStart', fileName });
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) {
        logger.error('Storage upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      logger.component.update('KnowledgeManagement', { action: 'uploadSuccess', path: uploadData.path });

      // Create a signed URL for the uploaded file
      const { data: signed, error: signErr } = await supabase
        .storage
        .from('documents')
        .createSignedUrl(uploadData.path, 600); // 10 minute expiry

      if (signErr || !signed?.signedUrl) {
        logger.error('Failed to create signed URL:', signErr);
        throw new Error('Failed to create signed URL for processing');
      }

      logger.info('KnowledgeManagement: Created signed URL for processing:', {
        originalPath: uploadData.path,
        signedUrlLength: signed.signedUrl.length,
        signedUrlPreview: signed.signedUrl.substring(0, 100) + '...'
      });

      // Trigger background processing using the enhanced processors
      // Convert MIME type to simple content type for database constraint
      const contentType = file.type === 'application/pdf' ? 'pdf' : 'text';
      const isPDF = contentType === 'pdf';
      
      // Show processing guidance for PDFs
      if (isPDF) {
        toast({
          title: "Processing PDF",
          description: "Using enhanced AI-powered text extraction. For best results, ensure your PDF contains selectable text.",
          variant: "default"
        });
      }
      
      // Use the robust PDF processor function
      const processingFunction = 'pdf_processor';
      logger.component.update('KnowledgeManagement', { action: 'processingStart', function: processingFunction });
      
      logger.info('KnowledgeManagement: About to call edge function...');
      logger.info('KnowledgeManagement: Function name:', processingFunction);
      logger.info('KnowledgeManagement: Request body:', {
        fileUrl: signed.signedUrl,
        fileName: file.name,
        deliberationId: selectedAgent,
        userId: user.id
      });
      
      logger.info('KnowledgeManagement: Calling robust PDF processor with:', {
        function: processingFunction,
        fileName: file.name,
        urlLength: signed.signedUrl.length,
        selectedAgent: selectedAgent,
        deliberationId: `default-${user.id}`
      });
      
      const { data, error } = await supabase.functions.invoke(processingFunction, {
        body: {
          fileUrl: signed.signedUrl, // Now using the proper signed URL
          fileName: file.name,
          deliberationId: selectedAgent, // Use the selected agent ID instead of default
          userId: user.id
        }
      });

      logger.info('KnowledgeManagement: Edge function response received!');
      logger.info('KnowledgeManagement: Edge function response:', {
        hasData: !!data,
        hasError: !!error,
        dataKeys: data ? Object.keys(data) : [],
        errorMessage: error?.message,
        fullResponse: { data, error }
      });

      if (error) {
        logger.error('Processing error', { error });
        // Clean up uploaded file on processing error
        await supabase.storage.from('documents').remove([uploadData.path]);
        throw new Error(error.message || 'Processing failed');
      }

      if (data?.success) {
        const chunksProcessed = data.chunksProcessed || 0;
        const totalChunks = data.totalChunks || chunksProcessed;
        
        toast({
          title: "Success",
          description: `Successfully uploaded and processed ${file.name}. Created ${chunksProcessed} knowledge chunks${totalChunks !== chunksProcessed ? ` (${totalChunks} total chunks)` : ''}.`
        });
        setUploadOpen(false);
        loadKnowledgeForAgent(selectedAgent);
      } else {
        // Clean up uploaded file on processing failure
        await supabase.storage.from('documents').remove([uploadData.path]);
        throw new Error(data?.error || 'Processing failed');
      }
    } catch (error: any) {
      logger.error('Upload error', { error });
      toast({
        title: "Error",
        description: `Failed to process file: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleQueryKnowledge = async () => {
    if (!query.trim() || !selectedAgent) return;

    setQuerying(true);
    try {
              const { data, error } = await supabase.functions.invoke('knowledge_query', {
        body: {
          query: query.trim(),
          agentId: selectedAgent,
          maxResults: 5
        }
      });

      if (error) throw error;

      if (data.success) {
        setQueryResults(data);
        toast({
          title: "Success",
          description: `Found ${data.knowledgeChunks} relevant knowledge chunks`
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      logger.error('Query error', { error });
      toast({
        title: "Error",
        description: `Failed to query knowledge: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setQuerying(false);
    }
  };

  const deleteKnowledgeItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('agent_knowledge')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Knowledge item deleted"
      });
      
      if (selectedAgent) {
        loadKnowledgeForAgent(selectedAgent);
      }
    } catch (error) {
      logger.error('Delete error', { error });
      toast({
        title: "Error",
        description: "Failed to delete knowledge item",
        variant: "destructive"
      });
    }
  };

  const deleteAllKnowledgeForAgent = async () => {
    if (!selectedAgent) return;

    setDeletingAll(true);
    try {
      const { error } = await supabase
        .from('agent_knowledge')
        .delete()
        .eq('agent_id', selectedAgent);

      if (error) throw error;

      toast({
        title: "Success",
        description: "All knowledge items deleted for this agent"
      });
      
      setDeleteAllOpen(false);
      setKnowledgeItems([]);
    } catch (error) {
      logger.error('Delete all error', { error });
      toast({
        title: "Error", 
        description: "Failed to delete all knowledge items",
        variant: "destructive"
      });
    } finally {
      setDeletingAll(false);
    }
  };

  const getAgentName = (agentId: string) => {
    const agent = safeAgents.find(a => a.id === agentId);
    return agent?.name || 'Unknown Agent';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Local Agent Knowledge Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          {safeAgents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Local Agents Available</h3>
              <p className="mb-4">
                Local agents are deliberation-specific and can have custom knowledge uploaded to them.
              </p>
              <p className="text-sm">
                Create local agents in the Agents tab to start managing knowledge.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="agent-select">Select Local Agent</Label>
                <Select 
                  value={selectedAgent} 
                  onValueChange={(value) => {
                    setSelectedAgent(value);
                    loadKnowledgeForAgent(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a local agent to manage knowledge" />
                  </SelectTrigger>
                  <SelectContent>
                    {safeAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <span>{agent.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {agent.agent_type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedAgent && safeAgents.length > 0 && (
              <div className="flex gap-4">
                <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-democratic-blue hover:bg-democratic-blue/90">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Knowledge
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload Knowledge File</DialogTitle>
                      <DialogDescription>
                        Upload a PDF or text file to add to {getAgentName(selectedAgent)}'s knowledge base
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="file">File</Label>
                        <Input
                          ref={fileInputRef}
                          id="file"
                          type="file"
                          accept=".pdf,.txt,.md"
                          onChange={handleFileUpload}
                          disabled={uploading}
                        />
                      </div>
                      {uploading && (
                        <div className="flex items-center gap-2">
                          <LoadingSpinner />
                          <span>Processing file...</span>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={queryOpen} onOpenChange={setQueryOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Search className="h-4 w-4 mr-2" />
                      Test Knowledge Query
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Test Knowledge Query</DialogTitle>
                      <DialogDescription>
                        Test how {getAgentName(selectedAgent)} would respond to questions
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="query">Question</Label>
                        <Textarea
                          id="query"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Ask a question about the agent's knowledge..."
                          rows={3}
                        />
                      </div>
                      <Button 
                        onClick={handleQueryKnowledge}
                        disabled={querying || !query.trim()}
                        className="bg-democratic-blue hover:bg-democratic-blue/90"
                      >
                        {querying ? 'Querying...' : 'Query Knowledge'}
                      </Button>
                      
                      {queryResults && (
                        <div className="mt-4 p-4 bg-muted rounded-lg">
                          <h4 className="font-semibold mb-2">Response:</h4>
                          <p className="whitespace-pre-wrap">{queryResults.response}</p>
                          <div className="mt-2 text-sm text-muted-foreground">
                            Used {queryResults.knowledgeChunks} knowledge chunks
                          </div>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                {knowledgeItems.length > 0 && (
                  <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Delete All Knowledge
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete All Knowledge</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete all knowledge items for {getAgentName(selectedAgent)}? 
                          This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => setDeleteAllOpen(false)}
                          disabled={deletingAll}
                        >
                          Cancel
                        </Button>
                        <Button 
                          variant="destructive" 
                          onClick={deleteAllKnowledgeForAgent}
                          disabled={deletingAll}
                        >
                          {deletingAll ? (
                            <>
                              <LoadingSpinner className="mr-2" />
                              Deleting...
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete All ({knowledgeItems.length} items)
                            </>
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Knowledge Items */}
      {selectedAgent && (
        <Card>
          <CardHeader>
            <CardTitle>Knowledge Items for {getAgentName(selectedAgent)}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingKnowledge ? (
              <LoadingSpinner />
            ) : knowledgeItems.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No knowledge items found. Upload some files to get started.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Chunk</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {knowledgeItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={item.title}>
                          {item.title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {item.file_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.content_type}</Badge>
                      </TableCell>
                      <TableCell>
                        {item.chunk_index + 1}
                      </TableCell>
                      <TableCell>
                        {formatToUKDate(item.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteKnowledgeItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};