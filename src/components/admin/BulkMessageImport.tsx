import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, FileText, Play, Pause, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useStableServices } from '@/hooks/useStableServices';
import { supabase } from '@/integrations/supabase/client';

interface ImportBatch {
  id: string;
  filename: string;
  total_messages: number;
  imported_messages: number;
  processed_messages: number;
  failed_messages: number;
  import_status: string;
  processing_status: string;
  created_at: string;
  deliberation_id: string;
}

interface Deliberation {
  id: string;
  title: string;
  status: string;
}

export const BulkMessageImport: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDeliberation, setSelectedDeliberation] = useState<string>('');
  const [deliberations, setDeliberations] = useState<Deliberation[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ imported: number; total: number }>({ imported: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { adminService } = useStableServices();

  React.useEffect(() => {
    loadDeliberations();
    loadImportBatches();
  }, []);

  const loadDeliberations = async () => {
    try {
      const { data, error } = await supabase
        .from('deliberations')
        .select('id, title, status')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeliberations(data || []);
    } catch (error) {
      console.error('Error loading deliberations:', error);
      toast.error('Failed to load deliberations');
    }
  };

  const loadImportBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('bulk_import_batches')
        .select(`
          id, filename, total_messages, imported_messages, processed_messages, failed_messages,
          import_status, processing_status, created_at, deliberation_id,
          deliberations(title)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setImportBatches(data || []);
    } catch (error) {
      console.error('Error loading import batches:', error);
      toast.error('Failed to load import history');
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        toast.error('Please select a CSV file');
        return;
      }
      setSelectedFile(file);
    }
  };

  const validateCSV = (csvText: string): boolean => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return false;
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
    return headers.includes('content') && headers.includes('user_id');
  };

  const handleImport = async () => {
    if (!selectedFile || !selectedDeliberation) {
      toast.error('Please select a file and deliberation');
      return;
    }

    setIsImporting(true);
    try {
      // Read file content
      const csvText = await selectedFile.text();
      
      if (!validateCSV(csvText)) {
        toast.error('CSV must contain "content" and "user_id" columns');
        return;
      }

      // Call bulk import function
      const { data, error } = await supabase.functions.invoke('bulk-import-messages', {
        body: {
          deliberationId: selectedDeliberation,
          csvData: csvText,
          filename: selectedFile.name
        }
      });

      if (error) throw error;

      toast.success(`Successfully imported ${data.imported_messages} messages`);
      
      // Reset form
      setSelectedFile(null);
      setSelectedDeliberation('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      // Reload batches
      loadImportBatches();
      
    } catch (error) {
      console.error('Import error:', error);
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleProcessAgentResponses = async (batchId: string) => {
    setIsProcessing(batchId);
    try {
      const { data, error } = await supabase.functions.invoke('process-bulk-agent-responses', {
        body: { batchId }
      });

      if (error) throw error;

      toast.success(`Processing started for ${data.total_messages} messages`);
      loadImportBatches();
      
    } catch (error) {
      console.error('Processing error:', error);
      toast.error(`Failed to start processing: ${error.message}`);
    } finally {
      setIsProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { variant: 'secondary' as const, icon: AlertCircle },
      importing: { variant: 'default' as const, icon: Upload },
      imported: { variant: 'outline' as const, icon: FileText },
      processing_agents: { variant: 'default' as const, icon: Play },
      completed: { variant: 'default' as const, icon: CheckCircle },
      failed: { variant: 'destructive' as const, icon: XCircle }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Import Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Bulk Message Import
          </CardTitle>
          <CardDescription>
            Upload a CSV file with message content and user IDs to import messages in bulk. 
            Required columns: content, user_id. Optional: created_at
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="deliberation">Select Deliberation</Label>
              <Select value={selectedDeliberation} onValueChange={setSelectedDeliberation}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a deliberation..." />
                </SelectTrigger>
                <SelectContent>
                  {deliberations.map((deliberation) => (
                    <SelectItem key={deliberation.id} value={deliberation.id}>
                      {deliberation.title} ({deliberation.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV File</Label>
              <Input
                ref={fileInputRef}
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                disabled={isImporting}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>

          <Button 
            onClick={handleImport} 
            disabled={!selectedFile || !selectedDeliberation || isImporting}
            className="w-full"
          >
            {isImporting ? (
              <>
                <Upload className="mr-2 h-4 w-4 animate-spin" />
                Importing Messages...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import Messages
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
          <CardDescription>
            Recent bulk import batches and their processing status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {importBatches.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No import batches found</p>
          ) : (
            <div className="space-y-4">
              {importBatches.map((batch) => (
                <div key={batch.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{batch.filename}</h4>
                      <p className="text-sm text-muted-foreground">
                        {new Date(batch.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {getStatusBadge(batch.import_status)}
                      {batch.processing_status !== 'not_started' && getStatusBadge(batch.processing_status)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Messages:</span>
                      <span className="ml-1 font-medium">{batch.total_messages}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Imported:</span>
                      <span className="ml-1 font-medium">{batch.imported_messages}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Agent Responses:</span>
                      <span className="ml-1 font-medium">{batch.processed_messages}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Failed:</span>
                      <span className="ml-1 font-medium text-destructive">{batch.failed_messages}</span>
                    </div>
                  </div>

                  {batch.imported_messages > 0 && (
                    <Progress 
                      value={(batch.processed_messages / batch.imported_messages) * 100} 
                      className="h-2"
                    />
                  )}

                  {batch.import_status === 'imported' && batch.processing_status === 'not_started' && (
                    <Button
                      size="sm"
                      onClick={() => handleProcessAgentResponses(batch.id)}
                      disabled={isProcessing === batch.id}
                    >
                      {isProcessing === batch.id ? (
                        <>
                          <Play className="mr-2 h-4 w-4 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Generate Agent Responses
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CSV Format Help */}
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertDescription>
          <strong>CSV Format:</strong> Your CSV should have headers "content" and "user_id". 
          Optional: "created_at" (ISO timestamp). Make sure all user_id values correspond to users who are participants in the selected deliberation.
        </AlertDescription>
      </Alert>
    </div>
  );
};