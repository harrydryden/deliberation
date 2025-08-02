import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { RefreshCw, Plus, Trash2, Key, Copy } from 'lucide-react';
import { formatToUKDate } from '@/utils/timeUtils';
import { AccessCode } from '@/services/backend/base.service';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { toast } from 'sonner';

interface AccessCodeManagementProps {
  accessCodes: AccessCode[];
  loading: boolean;
  onLoad: () => void;
  onCreate: (codeType: string) => void;
  onDelete: (id: string) => void;
}

export const AccessCodeManagement = ({ accessCodes, loading, onLoad, onCreate, onDelete }: AccessCodeManagementProps) => {
  const [creating, setCreating] = useState(false);
  const [newCodeType, setNewCodeType] = useState('standard');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (accessCodes.length === 0 && !loading) {
      onLoad();
    }
  }, [accessCodes.length, loading, onLoad]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await onCreate(newCodeType);
      setNewCodeType('standard');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await onDelete(id);
    } finally {
      setDeleting(null);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Access code copied to clipboard');
  };

  const getStatusBadge = (accessCode: AccessCode) => {
    if (accessCode.is_used) {
      return <Badge variant="secondary">Used</Badge>;
    }
    return <Badge variant="default">Available</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      'standard': 'default',
      'admin': 'destructive'
    };
    return <Badge variant={variants[type] || 'default'}>{type}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Access Code Management
        </CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onLoad} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Create New Access Code */}
        <div className="mb-6 p-4 border rounded-lg space-y-4">
          <h3 className="font-medium">Create New Access Code</h3>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium">Code Type</label>
              <Select value={newCodeType} onValueChange={setNewCodeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={creating}>
              <Plus className="h-4 w-4 mr-2" />
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>

        {loading && accessCodes.length === 0 ? (
          <LoadingSpinner />
        ) : accessCodes.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No access codes found</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Total access codes: {accessCodes.length} | 
              Used: {accessCodes.filter(code => code.is_used).length} | 
              Available: {accessCodes.filter(code => !code.is_used).length}
            </p>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Used By</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessCodes.map((accessCode) => (
                  <TableRow key={accessCode.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono bg-muted px-2 py-1 rounded">
                          {accessCode.code}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(accessCode.code)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getTypeBadge(accessCode.code_type)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(accessCode)}
                    </TableCell>
                    <TableCell>
                      {accessCode.used_by ? (
                        <span className="font-mono text-sm">
                          {accessCode.used_by.slice(0, 8)}...
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatToUKDate(accessCode.created_at)}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled={deleting === accessCode.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Access Code</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this access code? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDelete(accessCode.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};