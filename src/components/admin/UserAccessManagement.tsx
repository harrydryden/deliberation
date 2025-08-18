import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { RefreshCw, Trash2, UserCog, Copy } from 'lucide-react';
import { User } from '@/types/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { toast } from 'sonner';

interface UserAccessManagementProps {
  users: User[];
  accessCodes: any[]; // Deprecated but kept for interface compatibility
  loading: boolean;
  loadingAccessCodes: boolean; // Deprecated but kept for interface compatibility
  onLoadUsers: () => void;
  onLoadAccessCodes: () => void; // Deprecated but kept for interface compatibility
  onArchiveUser: (userId: string, reason?: string) => void;
  onUnarchiveUser: (userId: string) => void;
  onCreateAccessCode: (codeType: string) => void; // Deprecated but kept for interface compatibility
  onDeleteAccessCode: (id: string) => void; // Deprecated but kept for interface compatibility
}

export const UserAccessManagement = ({ 
  users, 
  loading, 
  onLoadUsers, 
  onArchiveUser,
}: UserAccessManagementProps) => {
  const [archivingUser, setArchivingUser] = useState<string | null>(null);

  useEffect(() => {
    if (users.length === 0 && !loading) {
      onLoadUsers();
    }
  }, [users.length, loading, onLoadUsers]);


  const handleArchiveUser = async (userId: string) => {
    setArchivingUser(userId);
    try {
      await onArchiveUser(userId, 'Archived by admin');
    } finally {
      setArchivingUser(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            User Management
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onLoadUsers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh Users
          </Button>
        </CardHeader>
        <CardContent>
          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="p-3 border rounded-lg">
              <div className="text-2xl font-semibold">{users.length}</div>
              <div className="text-sm text-muted-foreground">Total Users</div>
            </div>
            <div className="p-3 border rounded-lg">
              <div className="text-2xl font-semibold">{users.filter(u => u.role === 'admin').length}</div>
              <div className="text-sm text-muted-foreground">Admin Users</div>
            </div>
          </div>

          {loading && users.length === 0 ? (
            <LoadingSpinner />
          ) : users.length > 0 ? (
            <div>
              <h3 className="text-lg font-semibold mb-4">Users</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Access Code 1</TableHead>
                    <TableHead>Access Code 2</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Deliberations</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                          {user.id.slice(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                            {user.accessCode1 || 'N/A'}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(user.accessCode1 || 'N/A')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                            {user.accessCode2 || 'N/A'}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(user.accessCode2 || 'N/A')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                       <TableCell>
                         <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                           {user.role === 'admin' ? 'Admin' : 'User'}
                         </Badge>
                       </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {user.deliberations && user.deliberations.length > 0 ? (
                            user.deliberations.map((delib) => (
                              <div key={delib.id} className="text-sm">
                                <span className="font-medium">{delib.title}</span>
                                <span className="text-muted-foreground ml-2">({delib.role})</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-sm">No deliberations</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="destructive" 
                              size="sm"
                              disabled={archivingUser === user.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Archive User</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will archive the user and revoke their access. Their data will be preserved but they cannot log in.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleArchiveUser(user.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Archive
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
          ) : (
            <p className="text-muted-foreground text-center py-8">No users found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};