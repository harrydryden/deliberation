import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Download, Upload, Trash2, RotateCcw, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

type BackupConfig = {
  id: string;
  name: string;
  description?: string;
  backup_data: any;
  created_at: string;
  created_by: string;
};

export const ConfigBackupManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [backupName, setBackupName] = useState("");
  const [backupDescription, setBackupDescription] = useState("");

  const { data: configs } = useQuery({
    queryKey: ["agent-configurations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_configurations")
        .select("*")
        .eq("is_default", true)
        .order("agent_type");
      
      if (error) throw error;
      return data;
    },
  });

  const createBackupMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      // For now, we'll store backups as JSON in the browser's localStorage
      // In a production environment, you'd want to store these in a dedicated backup table
      const backupData = {
        configurations: configs,
        timestamp: new Date().toISOString(),
        name,
        description,
      };

      const backups = JSON.parse(localStorage.getItem("agent_config_backups") || "[]");
      const newBackup = {
        id: crypto.randomUUID(),
        name,
        description,
        backup_data: backupData,
        created_at: new Date().toISOString(),
        created_by: "current_user", // In real app, get from auth
      };

      backups.push(newBackup);
      localStorage.setItem("agent_config_backups", JSON.stringify(backups));
      
      return newBackup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-backups"] });
      setBackupName("");
      setBackupDescription("");
      toast({
        title: "Backup Created",
        description: "Configuration backup created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Backup Failed",
        description: `Failed to create backup: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const { data: backups } = useQuery({
    queryKey: ["config-backups"],
    queryFn: async () => {
      const backups = JSON.parse(localStorage.getItem("agent_config_backups") || "[]");
      return backups.sort((a: BackupConfig, b: BackupConfig) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ) as BackupConfig[];
    },
  });

  const handleCreateBackup = () => {
    if (!backupName.trim()) {
      toast({
        title: "Missing Name",
        description: "Please provide a name for the backup.",
        variant: "destructive",
      });
      return;
    }

    createBackupMutation.mutate({
      name: backupName,
      description: backupDescription || undefined,
    });
  };

  const handleDownloadBackup = (backup: BackupConfig) => {
    const dataStr = JSON.stringify(backup.backup_data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent-config-backup-${backup.name}-${format(new Date(backup.created_at), 'yyyy-MM-dd')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteBackup = (backupId: string) => {
    const backups = JSON.parse(localStorage.getItem("agent_config_backups") || "[]");
    const updatedBackups = backups.filter((backup: BackupConfig) => backup.id !== backupId);
    localStorage.setItem("agent_config_backups", JSON.stringify(updatedBackups));
    queryClient.invalidateQueries({ queryKey: ["config-backups"] });
    
    toast({
      title: "Backup Deleted",
      description: "Backup has been successfully deleted.",
    });
  };

  const handleRestoreBackup = async (backup: BackupConfig) => {
    try {
      const backupConfigs = backup.backup_data.configurations;
      
      // In a real implementation, you would restore these to the database
      // For now, we'll just show a success message
      toast({
        title: "Restore Simulation",
        description: `Would restore ${backupConfigs.length} configurations from backup "${backup.name}". This is a simulation - actual database restore not implemented.`,
      });
    } catch (error: any) {
      toast({
        title: "Restore Failed",
        description: `Failed to restore backup: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New Backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="backup-name">Backup Name</Label>
              <Input
                id="backup-name"
                value={backupName}
                onChange={(e) => setBackupName(e.target.value)}
                placeholder="e.g., Pre-update backup"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="backup-description">Description (Optional)</Label>
              <Input
                id="backup-description"
                value={backupDescription}
                onChange={(e) => setBackupDescription(e.target.value)}
                placeholder="Description of changes..."
              />
            </div>
          </div>
          
          <Button 
            onClick={handleCreateBackup} 
            disabled={createBackupMutation.isPending || !backupName.trim()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Create Backup
          </Button>

          {configs && (
            <div className="mt-4 p-3 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground">
                Will backup {configs.length} agent configurations:
              </p>
              <div className="flex gap-2 mt-2">
                {configs.map((config) => (
                  <Badge key={config.id} variant="outline" className="text-xs">
                    {config.agent_type.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available Backups</CardTitle>
        </CardHeader>
        <CardContent>
          {backups && backups.length > 0 ? (
            <div className="space-y-4">
              {backups.map((backup) => (
                <div key={backup.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{backup.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          <Calendar className="h-3 w-3 mr-1" />
                          {format(new Date(backup.created_at), 'MMM dd, yyyy HH:mm')}
                        </Badge>
                      </div>
                      {backup.description && (
                        <p className="text-sm text-muted-foreground mb-2">{backup.description}</p>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Contains {backup.backup_data.configurations?.length || 0} configurations
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadBackup(backup)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestoreBackup(backup)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteBackup(backup.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No backups found. Create your first backup above.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};