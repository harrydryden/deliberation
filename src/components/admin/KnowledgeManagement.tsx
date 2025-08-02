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
import { Upload, FileText, Brain, Trash2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatToUKDate } from '@/utils/timeUtils';
import { supabase } from '@/integrations/supabase/client';
import { Agent } from '@/types/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [queryOpen, setQueryOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [querying, setQuerying] = useState(false);
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
      console.error('Error loading knowledge:', error);
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
    if (!file || !selectedAgent) return;

    if (file.type !== 'application/pdf' && !file.type.startsWith('text/')) {
      toast({
        title: "Error",
        description: "Please upload a PDF or text file",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      let fileContent = '';
      
      if (file.type.startsWith('text/')) {
        fileContent = await file.text();
      } else if (file.type === 'application/pdf') {
        // Convert PDF to base64 for processing in the edge function
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        
        // Process in chunks to avoid call stack overflow
        let binaryString = '';
        const chunkSize = 8192; // Process 8KB at a time
        
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.slice(i, i + chunkSize);
          binaryString += String.fromCharCode(...chunk);
        }
        
        const base64String = btoa(binaryString);
        fileContent = base64String;
      }

      // Process the knowledge
      const { data, error } = await supabase.functions.invoke('process-agent-knowledge', {
        body: {
          fileContent,
          fileName: file.name,
          agentId: selectedAgent,
          contentType: file.type
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Success",
          description: `Processed ${data.chunksProcessed} knowledge chunks`
        });
        setUploadOpen(false);
        loadKnowledgeForAgent(selectedAgent);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Upload error:', error);
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
      const { data, error } = await supabase.functions.invoke('query-agent-knowledge', {
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
      console.error('Query error:', error);
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
      console.error('Delete error:', error);
      toast({
        title: "Error",
        description: "Failed to delete knowledge item",
        variant: "destructive"
      });
    }
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
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
                  {agents.filter(agent => agent.deliberation).map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        <span>{agent.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {agent.deliberation?.title}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedAgent && agents.filter(agent => agent.deliberation).length > 0 && (
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
                  <DialogContent className="max-w-4xl">
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
              </div>
            )}
          </div>
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