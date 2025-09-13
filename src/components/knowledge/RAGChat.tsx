import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Brain, Send, Loader2, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Agent } from '@/types/index';
import { logger } from '@/utils/logger';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  knowledgeChunks?: number;
  relevantKnowledge?: any[];
}

interface RAGChatProps {
  agents?: Agent[];
}

export function RAGChat({ agents }: RAGChatProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedAgent || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Try LangChain function first, fallback to original if needed
      const { data, error } = await supabase.functions.invoke('knowledge_query', {
        body: {
          query: inputMessage,
          agentId: selectedAgent,
          maxResults: 5
        }
      });

      let responseData = data;
      let hasError = error;

      // If LangChain function fails, try the original function
      if (error || !data?.success) {
        logger.component.update('RAGChat', { action: 'fallbackToOriginal', agentId: selectedAgent });
        
        const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke('knowledge_query', {
          body: {
            query: inputMessage,
            agentId: selectedAgent,
            maxResults: 5
          }
        });
        
        responseData = fallbackData;
        hasError = fallbackError;
      }

      if (hasError) {
        // Client-side fallback: simple keyword search on agent_knowledge
        try {
          const { data: rows, error: kgError } = await supabase
            .from('agent_knowledge')
            .select('id, title, content, content_type, file_name, chunk_index, metadata, created_at')
            .eq('agent_id', selectedAgent)
            .ilike('content', `%${inputMessage}%`)
            .limit(5);
          if (kgError) throw kgError;
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            type: 'assistant',
            content: rows && rows.length > 0 
              ? `Found ${rows.length} matching knowledge chunks.`
              : 'No relevant knowledge found for this query.',
            timestamp: new Date(),
            knowledgeChunks: rows?.length || 0,
            relevantKnowledge: rows || []
          };
          setMessages(prev => [...prev, assistantMessage]);
          return;
        } catch (fallbackErr: any) {
          throw new Error(fallbackErr.message || 'Query failed');
        }
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: responseData?.response || 'No response received',
        timestamp: new Date(),
        knowledgeChunks: responseData?.knowledgeChunks || 0,
        relevantKnowledge: responseData?.relevantKnowledge || []
      };
      setMessages(prev => [...prev, assistantMessage]);

      if (responseData?.knowledgeChunks === 0) {
        toast({
          title: "Notice",
          description: "No relevant knowledge found for this query. Consider uploading relevant documents.",
          variant: "default"
        });
      } else if (responseData?.langchainProcessed) {
        toast({
          title: "LangChain Enhanced",
          description: "Response generated using LangChain RAG for improved accuracy.",
          variant: "default"
        });
      }
    } catch (error: any) {
      logger.component.error('RAGChat', error);
      toast({
        title: "Error",
        description: `Failed to get response: ${error.message}`,
        variant: "destructive"
      });

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'Sorry, I encountered an error while processing your question.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          Knowledge Assistant
        </CardTitle>
        
        {agents && agents.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="chat-agent-select">Select Local Agent</Label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a local agent to chat with..." />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name} ({agent.agent_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Chat with local agents that have knowledge specific to deliberations.
            </p>
          </div>
        ) : (
          <div className="text-center py-2 text-muted-foreground">
            <p className="text-sm">No local agents available.</p>
            <p className="text-xs">Local agents are created for specific deliberations and can have custom knowledge.</p>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col space-y-4">
        <ScrollArea className="flex-1 p-4 border rounded-md">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Ask me anything about the uploaded documents!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                    {message.type === 'assistant' && message.knowledgeChunks !== undefined && (
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          <FileText className="h-3 w-3 mr-1" />
                          {message.knowledgeChunks} sources
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {message.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Deliberating...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about the uploaded documents..."
            disabled={!selectedAgent || isLoading}
          />
          <Button 
            onClick={handleSendMessage}
            disabled={!selectedAgent || !inputMessage.trim() || isLoading}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}