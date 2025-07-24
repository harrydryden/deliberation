import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Upload, FileText, Plus, Trash2, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type AgentConfig = {
  id: string;
  agent_type: string;
  name: string;
};

type KnowledgeItem = {
  id: string;
  agent_id: string;
  title: string;
  content: string;
  content_type: 'text' | 'pdf';
  file_name?: string;
  file_size?: number;
  chunk_index: number;
  metadata: any;
  created_at: string;
};

export const KnowledgeManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<string>("bill_agent");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [newKnowledge, setNewKnowledge] = useState({
    title: "",
    content: "",
    contentType: "text" as "text" | "pdf"
  });
  const [uploading, setUploading] = useState(false);

  // Fetch agent configurations
  const { data: agents } = useQuery({
    queryKey: ["agent-configurations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_configurations")
        .select("id, agent_type, name")
        .eq("is_default", true)
        .order("agent_type");
      
      if (error) throw error;
      return data as AgentConfig[];
    },
  });

  // Fetch knowledge for selected agent
  const { data: knowledge, isLoading: loadingKnowledge } = useQuery({
    queryKey: ["agent-knowledge", selectedAgentId],
    queryFn: async () => {
      if (!selectedAgentId) return [];
      
      const { data, error } = await supabase
        .from("agent_knowledge")
        .select("*")
        .eq("agent_id", selectedAgentId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as KnowledgeItem[];
    },
    enabled: !!selectedAgentId,
  });

  // Set selected agent ID when agent changes
  useEffect(() => {
    if (agents && selectedAgent) {
      const agent = agents.find(a => a.agent_type === selectedAgent);
      if (agent) {
        setSelectedAgentId(agent.id);
      }
    }
  }, [agents, selectedAgent]);

  // Add text knowledge mutation
  const addTextKnowledgeMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; agentId: string }) => {
      const { data: result, error } = await supabase.functions.invoke('process-knowledge', {
        body: {
          agentId: data.agentId,
          title: data.title,
          content: data.content,
          contentType: 'text'
        }
      });
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-knowledge", selectedAgentId] });
      setNewKnowledge({ title: "", content: "", contentType: "text" });
      toast({
        title: "Knowledge Added",
        description: "Text knowledge has been successfully added.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add knowledge: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Delete knowledge mutation
  const deleteKnowledgeMutation = useMutation({
    mutationFn: async (knowledgeId: string) => {
      const { error } = await supabase
        .from("agent_knowledge")
        .delete()
        .eq("id", knowledgeId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-knowledge", selectedAgentId] });
      toast({
        title: "Knowledge Deleted",
        description: "Knowledge item has been successfully deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete knowledge: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleAddTextKnowledge = () => {
    if (!newKnowledge.title.trim() || !newKnowledge.content.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both title and content.",
        variant: "destructive",
      });
      return;
    }

    addTextKnowledgeMutation.mutate({
      title: newKnowledge.title,
      content: newKnowledge.content,
      agentId: selectedAgentId
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedAgentId) return;

    if (file.type !== 'application/pdf') {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    
    try {
      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const { data, error } = await supabase.functions.invoke('process-knowledge', {
        body: {
          agentId: selectedAgentId,
          title: file.name.replace('.pdf', ''),
          content: base64,
          contentType: 'pdf',
          fileName: file.name,
          fileSize: file.size
        }
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["agent-knowledge", selectedAgentId] });
      toast({
        title: "PDF Processed",
        description: `Successfully processed "${file.name}" into ${data.entries} knowledge chunks.`,
      });
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: `Failed to process PDF: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const agentTypes = [
    { value: "bill_agent", label: "Bill Agent", description: "IBIS structure facilitator" },
    { value: "peer_agent", label: "Peer Agent", description: "Peer interaction facilitator" },
    { value: "flow_agent", label: "Flow Agent", description: "Discussion flow manager" },
  ];

  // Group knowledge by title (for chunked content)
  const groupedKnowledge = knowledge?.reduce((acc, item) => {
    const baseTitle = item.title.replace(/ \(Part \d+\)$/, '');
    if (!acc[baseTitle]) {
      acc[baseTitle] = [];
    }
    acc[baseTitle].push(item);
    return acc;
  }, {} as Record<string, KnowledgeItem[]>) || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Tabs value={selectedAgent} onValueChange={setSelectedAgent} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            {agentTypes.map((agent) => (
              <TabsTrigger key={agent.value} value={agent.value} className="flex flex-col gap-1">
                <span className="font-medium">{agent.label}</span>
                <span className="text-xs text-muted-foreground">{agent.description}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Add Knowledge Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Knowledge
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Text Knowledge */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={newKnowledge.title}
                  onChange={(e) => setNewKnowledge({ ...newKnowledge, title: e.target.value })}
                  placeholder="Enter knowledge title"
                />
              </div>
              
              <div>
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  rows={6}
                  value={newKnowledge.content}
                  onChange={(e) => setNewKnowledge({ ...newKnowledge, content: e.target.value })}
                  placeholder="Enter text content or information for the agent"
                />
              </div>

              <Button 
                onClick={handleAddTextKnowledge}
                disabled={addTextKnowledgeMutation.isPending}
                className="w-full"
              >
                <FileText className="h-4 w-4 mr-2" />
                Add Text Knowledge
              </Button>
            </div>

            {/* PDF Upload */}
            <div className="border-t pt-4">
              <Label className="text-sm font-medium">Upload PDF</Label>
              <div className="mt-2">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">
                      {uploading ? "Processing PDF..." : "Click to upload PDF"}
                    </p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    disabled={uploading || !selectedAgentId}
                  />
                </label>
              </div>
            </div>

            <Alert>
              <AlertDescription>
                PDFs will be automatically processed into chunks and embedded for semantic search. 
                This enables the Bill Agent to chat with your PDF documents.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Knowledge List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Knowledge Base ({Object.keys(groupedKnowledge).length} items)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingKnowledge ? (
              <div>Loading knowledge...</div>
            ) : Object.keys(groupedKnowledge).length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No knowledge added yet. Add some text or upload a PDF to get started.
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedKnowledge).map(([title, items]) => (
                  <div key={title} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{title}</h4>
                        <div className="flex gap-2 mt-2">
                          <Badge variant={items[0].content_type === 'pdf' ? 'default' : 'secondary'}>
                            {items[0].content_type.toUpperCase()}
                          </Badge>
                          {items.length > 1 && (
                            <Badge variant="outline">
                              {items.length} chunks
                            </Badge>
                          )}
                          {items[0].file_name && (
                            <Badge variant="outline">
                              {Math.round((items[0].file_size || 0) / 1024)} KB
                            </Badge>
                          )}
                        </div>
                        {items[0].content_type === 'text' && (
                          <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                            {items[0].content.substring(0, 150)}...
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Delete all chunks for this knowledge item
                          items.forEach(item => {
                            deleteKnowledgeMutation.mutate(item.id);
                          });
                        }}
                        disabled={deleteKnowledgeMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};