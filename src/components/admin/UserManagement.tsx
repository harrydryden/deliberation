import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { RefreshCw, Trash2, UserCog } from 'lucide-react';
import { User } from '@/types/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

interface UserManagementProps {
  users: User[];
  loading: boolean;
  onLoad: () => void;
  onUpdateRole: (userId: string, role: string) => void;
  onDelete: (userId: string) => void;
}

export const UserManagement = ({ users, loading, onLoad, onUpdateRole, onDelete }: UserManagementProps) => {
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);

  useEffect(() => {
    if (users.length === 0 && !loading) {
      onLoad();
    }
  }, [users.length, loading, onLoad]);

  const handleRoleUpdate = async (userId: string, newRole: string) => {
    setUpdatingRole(userId);
    try {
      await onUpdateRole(userId, newRole);
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleDelete = async (userId: string) => {
    setDeletingUser(userId);
    try {
      await onDelete(userId);
    } finally {
      setDeletingUser(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-5 w-5" />
          User Management
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onLoad} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading && users.length === 0 ? (
          <LoadingSpinner />
        ) : users.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No users found</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Manage user roles and permissions. Total users: {users.length}
            </p>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expertise</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono text-sm">
                      {user.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      {user.profile?.displayName || 'No name'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={(user as any).user_role || 'user'}
                        onValueChange={(value) => handleRoleUpdate(user.id, value)}
                        disabled={updatingRole === user.id}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="moderator">Moderator</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.profile?.expertiseAreas?.map((area) => (
                          <Badge key={area} variant="secondary" className="text-xs">
                            {area}
                          </Badge>
                        )) || <span className="text-muted-foreground text-sm">None</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled={deletingUser === user.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this user? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDelete(user.id)}
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