import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RefreshCw, Archive, ArchiveRestore, UserCog, UserPlus } from 'lucide-react';
import { User, Deliberation } from '@/types/index';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface UserAccessManagementProps {
  users: User[];
  loading: boolean;
  onLoadUsers: () => void;
  onArchiveUser: (userId: string, reason?: string) => void;
  onUnarchiveUser: (userId: string) => void;
  onUpdateRole?: (userId: string, role: string) => void;
  deliberations?: Deliberation[];
}

export const UserAccessManagement = ({ 
  users, 
  loading, 
  onLoadUsers, 
  onArchiveUser,
  onUnarchiveUser,
  onUpdateRole,
  deliberations = []
}: UserAccessManagementProps) => {
  // Add null check for users to prevent runtime errors
  const safeUsers = users || [];
  // Add null check for deliberations to prevent runtime errors
  const safeDeliberations = deliberations || [];
  const [archivingUser, setArchivingUser] = useState<string | null>(null);
  const [unarchivingUser, setUnarchivingUser] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [showAddToDeliberation, setShowAddToDeliberation] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedDeliberation, setSelectedDeliberation] = useState<string>('');
  const [addingToDeliberation, setAddingToDeliberation] = useState(false);

  useEffect(() => {
    if (safeUsers.length === 0 && !loading) {
      onLoadUsers();
    }
  }, [safeUsers.length, loading, onLoadUsers]);


  const handleArchiveUser = async (userId: string) => {
    setArchivingUser(userId);
    try {
      await onArchiveUser(userId, 'Archived by admin');
    } finally {
      setArchivingUser(null);
    }
  };

  const handleUnarchiveUser = async (userId: string) => {
    setUnarchivingUser(userId);
    try {
      await onUnarchiveUser(userId);
    } finally {
      setUnarchivingUser(null);
    }
  };

  const handleRoleUpdate = async (userId: string, newRole: string) => {
    if (!onUpdateRole) return;
    setUpdatingRole(userId);
    try {
      await onUpdateRole(userId, newRole);
      toast.success(`User role updated to ${newRole}`);
    } catch (error) {
      toast.error('Failed to update user role');
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleAddToDeliberation = async () => {
    if (!selectedUser || !selectedDeliberation) return;
    
    setAddingToDeliberation(true);
    try {
      const { error } = await supabase
        .from('participants')
        .insert({
          user_id: selectedUser.id,
          deliberation_id: selectedDeliberation,
          role: 'participant'
        });

      if (error) throw error;

      toast.success(`${selectedUser.accessCode1} added to deliberation`);
      setShowAddToDeliberation(false);
      setSelectedUser(null);
      setSelectedDeliberation('');
      onLoadUsers(); // Refresh users to show updated deliberation list
    } catch (error) {
      logger.error('Error adding user to deliberation', { userId: selectedUser?.id, deliberationId: selectedDeliberation, error });
      toast.error('Failed to add user to deliberation');
    } finally {
      setAddingToDeliberation(false);
    }
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
              <div className="text-2xl font-semibold">{safeUsers.length}</div>
              <div className="text-sm text-muted-foreground">Total Users</div>
            </div>
            <div className="p-3 border rounded-lg">
              <div className="text-2xl font-semibold">{safeUsers.filter(u => u.role === 'admin').length}</div>
              <div className="text-sm text-muted-foreground">Admin Users</div>
            </div>
          </div>

          {loading && safeUsers.length === 0 ? (
            <LoadingSpinner />
          ) : safeUsers.length > 0 ? (
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
                  {safeUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <code className="font-mono text-xs bg-muted px-2 py-1 rounded block max-w-[120px] truncate">
                          {user.id}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm font-medium">
                          {user.accessCode1 || 'Not set'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">
                          {user.accessCode2 || 'Not set'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {onUpdateRole ? (
                          <Select
                            value={user.role || 'user'}
                            onValueChange={(value) => handleRoleUpdate(user.id, value)}
                            disabled={updatingRole === user.id || user.isArchived}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                            {user.role === 'admin' ? 'Admin' : 'User'}
                          </Badge>
                        )}
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
                         <div className="flex gap-2">
                           {!user.isArchived && (
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => {
                                 setSelectedUser(user);
                                 setShowAddToDeliberation(true);
                               }}
                             >
                               <UserPlus className="h-4 w-4 mr-1" />
                               Add to Deliberation
                             </Button>
                           )}
                           {user.isArchived ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              disabled={unarchivingUser === user.id}
                              onClick={() => handleUnarchiveUser(user.id)}
                            >
                              {unarchivingUser === user.id ? (
                                <LoadingSpinner size="sm" />
                              ) : (
                                <>
                                  <ArchiveRestore className="h-4 w-4 mr-1" />
                                  Unarchive
                                </>
                              )}
                            </Button>
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="destructive" 
                                  size="sm"
                                  disabled={archivingUser === user.id}
                                >
                                  {archivingUser === user.id ? (
                                    <LoadingSpinner size="sm" />
                                  ) : (
                                    <>
                                      <Archive className="h-4 w-4 mr-1" />
                                      Archive
                                    </>
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Archive User</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will archive the user account and revoke their access. 
                                    The user's data and participation history will be preserved, 
                                    but they will no longer be able to access the system. 
                                    This action can be reversed by unarchiving the user.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleArchiveUser(user.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Archive User
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
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

      {/* Add to Deliberation Dialog */}
      <Dialog open={showAddToDeliberation} onOpenChange={setShowAddToDeliberation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to Deliberation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Selected User</label>
              <div className="p-2 bg-muted rounded-md">
                {selectedUser?.accessCode1} ({selectedUser?.id})
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Deliberation</label>
              <Select 
                value={selectedDeliberation} 
                onValueChange={setSelectedDeliberation}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a deliberation" />
                </SelectTrigger>
                <SelectContent>
                  {safeDeliberations
                    .filter(delib => !selectedUser?.deliberations?.some(userDelib => userDelib.id === delib.id))
                    .map((deliberation) => (
                      <SelectItem key={deliberation.id} value={deliberation.id}>
                        {deliberation.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowAddToDeliberation(false);
                  setSelectedUser(null);
                  setSelectedDeliberation('');
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleAddToDeliberation}
                disabled={!selectedDeliberation || addingToDeliberation}
              >
                {addingToDeliberation ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  'Add to Deliberation'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};