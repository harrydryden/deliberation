import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Database, 
  Search, 
  RefreshCw, 
  BarChart3, 
  Zap, 
  Brain,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { useEnhancedKnowledgeQuery } from '@/hooks/useEnhancedKnowledgeQuery';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';

interface EmbeddingStats {
  agentId: string;
  totalRecords: number;
  withEmbeddings: number;
  withoutEmbeddings: number;
  embeddingCoverage: string;
}

export const EnhancedKnowledgeManagement: React.FC = () => {
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<any>(null);
  const [embeddingStats, setEmbeddingStats] = useState<EmbeddingStats | null>(null);
  const [backfillProgress, setBackfillProgress] = useState<any>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  
  const { queryKnowledge, isLoading, backfillEmbeddings, getEmbeddingStats } = useEnhancedKnowledgeQuery();
  const { toast } = useToast();

  useEffect(() => {
    loadEmbeddingStats();
  }, []);

  const loadEmbeddingStats = async () => {
    try {
      const stats = await getEmbeddingStats();
      if (stats.success) {
        setEmbeddingStats(stats.stats);
      }
    } catch (error) {
      logger.error('Failed to load embedding stats:', error as Error);
    }
  };

  const handleTestQuery = async () => {
    if (!testQuery.trim()) {
      toast({
        title: "Invalid Query",
        description: "Please enter a test query",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await queryKnowledge(testQuery, selectedAgentId);
      setTestResults(result);
      
      if (result.success) {
        toast({
          title: "Query Successful",
          description: `Retrieved ${result.response?.sources?.length || result.results?.length || 0} relevant documents`,
        });
      }
    } catch (error) {
      logger.error('Test query failed:', error as Error);
    }
  };

  const handleBackfillEmbeddings = async () => {
    try {
      const result = await backfillEmbeddings(selectedAgentId);
      setBackfillProgress(result);
      
      if (result.success) {
        toast({
          title: "Backfill Completed",
          description: `Updated ${result.updated} records with embeddings`,
        });
        await loadEmbeddingStats();
      }
    } catch (error) {
      logger.error('Backfill failed:', error as Error);
    }
  };

  const getCoverageColor = (coverage: string) => {
    const percent = parseFloat(coverage.replace('%', ''));
    if (percent >= 90) return 'text-green-600';
    if (percent >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getCoverageVariant = (coverage: string) => {
    const percent = parseFloat(coverage.replace('%', ''));
    if (percent >= 90) return 'default';
    if (percent >= 70) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <Brain className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Enhanced Knowledge Management</h2>
        <Badge variant="secondary">LangChain Powered</Badge>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="embeddings">Embeddings</TabsTrigger>
          <TabsTrigger value="testing">Testing</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Knowledge Records</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{embeddingStats?.totalRecords || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Knowledge chunks available
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Embedding Coverage</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getCoverageColor(embeddingStats?.embeddingCoverage || '0%')}`}>
                  {embeddingStats?.embeddingCoverage || '0%'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {embeddingStats?.withEmbeddings || 0} of {embeddingStats?.totalRecords || 0} records
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Enhanced Features</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="flex items-center text-xs">
                    <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                    Hybrid Retrieval
                  </div>
                  <div className="flex items-center text-xs">
                    <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                    Intent Analysis
                  </div>
                  <div className="flex items-center text-xs">
                    <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                    Query Expansion
                  </div>
                  <div className="flex items-center text-xs">
                    <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                    Source Attribution
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Alert>
            <Brain className="h-4 w-4" />
            <AlertDescription>
              The enhanced knowledge system uses LangChain for sophisticated RAG capabilities including 
              hybrid search, query analysis, and intelligent response generation with source attribution.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="embeddings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Embedding Management</CardTitle>
              <CardDescription>
                Manage vector embeddings for knowledge retrieval
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Input 
                  placeholder="Agent ID (optional - leave empty for all agents)"
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                />
                <Button 
                  onClick={loadEmbeddingStats}
                  variant="outline"
                  size="icon"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              {embeddingStats && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Embedding Coverage:</span>
                    <Badge variant={getCoverageVariant(embeddingStats.embeddingCoverage)}>
                      {embeddingStats.embeddingCoverage}
                    </Badge>
                  </div>
                  <Progress 
                    value={parseFloat(embeddingStats.embeddingCoverage.replace('%', ''))} 
                    className="w-full"
                  />
                  <div className="text-sm text-muted-foreground">
                    {embeddingStats.withEmbeddings} records with embeddings, {embeddingStats.withoutEmbeddings} without
                  </div>
                </div>
              )}

              <Button 
                onClick={handleBackfillEmbeddings}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" />
                    Backfill Missing Embeddings
                  </>
                )}
              </Button>

              {backfillProgress && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Backfill completed: {backfillProgress.updated} records updated, 
                    {backfillProgress.errors} errors in {backfillProgress.durationMs}ms
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge Query Testing</CardTitle>
              <CardDescription>
                Test the enhanced knowledge retrieval system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea 
                  placeholder="Enter your test query about policies or legislation..."
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  rows={3}
                />
                <Button 
                  onClick={handleTestQuery}
                  disabled={isLoading || !testQuery.trim()}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Querying...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Test Enhanced Query
                    </>
                  )}
                </Button>
              </div>

              {testResults && (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium mb-2">Query Analysis</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Intent: <Badge variant="outline">{testResults.response?.analysis?.intent || 'unknown'}</Badge></div>
                      <div>Complexity: <Badge variant="outline">{testResults.response?.analysis?.complexity || 'unknown'}</Badge></div>
                      <div>Confidence: {testResults.response?.analysis?.confidence ? (testResults.response.analysis.confidence * 100).toFixed(0) : '0'}%</div>
                      <div>Documents Used: {testResults.response?.sources?.length || testResults.results?.length || 0}</div>
                    </div>
                  </div>

                  {testResults.response?.content && (
                    <div className="p-4 bg-background border rounded-lg">
                      <h4 className="font-medium mb-2">Response</h4>
                      <p className="text-sm whitespace-pre-wrap">{testResults.response.content}</p>
                    </div>
                  )}

                  {((testResults.response?.sources && testResults.response.sources.length > 0) || 
                    (testResults.results && testResults.results.length > 0)) && (
                    <div className="space-y-2">
                      <h4 className="font-medium">Sources ({testResults.response?.sources?.length || testResults.results?.length || 0})</h4>
                      {(testResults.response?.sources || testResults.results || []).map((source: any, idx: number) => (
                        <div key={idx} className="p-2 bg-muted/50 rounded text-sm">
                          <div className="font-medium">{source.title}</div>
                          <div className="text-muted-foreground">
                            {source.file_name} (chunk {source.chunk_index})
                            {source.similarity && ` - ${(source.similarity * 100).toFixed(1)}% match`}
                          </div>
                          <div className="mt-1">{source.content?.slice(0, 200) + '...' || 'No content available'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Analytics</CardTitle>
              <CardDescription>
                Performance metrics and system health
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2" />
                  <p>Analytics dashboard coming soon...</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};