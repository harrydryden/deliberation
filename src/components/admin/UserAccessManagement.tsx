import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { RefreshCw, Plus, Trash2, UserCog, Key, Copy } from 'lucide-react';
import { formatToUKDate } from '@/utils/timeUtils';
import { User } from '@/types/api';
import { AccessCode } from '@/repositories/implementations/access-code.repository';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { toast } from 'sonner';
import { UserCreation } from './UserCreation';

interface UserAccessManagementProps {
  users: User[];
  accessCodes: AccessCode[];
  loading: boolean;
  loadingAccessCodes: boolean;
  onLoadUsers: () => void;
  onLoadAccessCodes: () => void;
  onUpdateRole: (userId: string, role: string) => void;
  onArchiveUser: (userId: string, reason?: string) => void;
  onUnarchiveUser: (userId: string) => void;
  onCreateAccessCode: (codeType: string) => void;
  onDeleteAccessCode: (id: string) => void;
}

export const UserAccessManagement = ({ 
  users, 
  accessCodes, 
  loading, 
  loadingAccessCodes,
  onLoadUsers, 
  onLoadAccessCodes,
  onUpdateRole, 
  onArchiveUser,
  onUnarchiveUser, 
  onCreateAccessCode, 
  onDeleteAccessCode 
}: UserAccessManagementProps) => {
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [archivingUser, setArchivingUser] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCodeType, setNewCodeType] = useState('user');
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  useEffect(() => {
    if (users.length === 0 && !loading) {
      onLoadUsers();
    }
    if (accessCodes.length === 0 && !loadingAccessCodes) {
      onLoadAccessCodes();
    }
  }, [users.length, accessCodes.length, loading, loadingAccessCodes, onLoadUsers, onLoadAccessCodes]);

  const handleRoleUpdate = async (userId: string, newRole: string) => {
    setUpdatingRole(userId);
    try {
      await onUpdateRole(userId, newRole);
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleArchiveUser = async (userId: string) => {
    setArchivingUser(userId);
    try {
      await onArchiveUser(userId, 'Archived by admin');
    } finally {
      setArchivingUser(null);
    }
  };

  const handleCreateAccessCode = async () => {
    setCreating(true);
    try {
      await onCreateAccessCode(newCodeType);
      setNewCodeType('user');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAccessCode = async (id: string) => {
    setDeletingCode(id);
    try {
      await onDeleteAccessCode(id);
    } finally {
      setDeletingCode(null);
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
      'user': 'default',
      'admin': 'destructive'
    };
    return <Badge variant={variants[type] || 'default'}>{type}</Badge>;
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      'user': 'default',
      'admin': 'destructive'
    };
    return <Badge variant={variants[role] || 'default'}>{role}</Badge>;
  };

  // Create a unified view of users and their access codes
  const usedAccessCodes = accessCodes.filter(code => code.is_used);
  const unusedAccessCodes = accessCodes.filter(code => !code.is_used);

  // Helper function to get code type for a user by their access code
  const getUserCodeType = (userAccessCode: string) => {
    const accessCode = accessCodes.find(code => code.code === userAccessCode);
    return accessCode?.code_type || 'unknown';
  };

  const isLoading = loading || loadingAccessCodes;

  return (
    <div className="space-y-6">
      {/* User Creation */}
      <UserCreation onUserCreated={onLoadUsers} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            User & Access Code Management
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onLoadUsers} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh Users
            </Button>
            <Button variant="outline" size="sm" onClick={onLoadAccessCodes} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingAccessCodes ? 'animate-spin' : ''}`} />
              Refresh Codes
            </Button>
          </div>
        </CardHeader>
        <CardContent>
        {/* Create New Access Code */}
        <div className="mb-6 p-4 border rounded-lg space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <Key className="h-4 w-4" />
            Create New Access Code
          </h3>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium">Code Type</label>
              <Select value={newCodeType} onValueChange={setNewCodeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreateAccessCode} disabled={creating}>
              <Plus className="h-4 w-4 mr-2" />
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-3 border rounded-lg">
            <div className="text-2xl font-semibold">{users.length}</div>
            <div className="text-sm text-muted-foreground">Active Users</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="text-2xl font-semibold">{accessCodes.length}</div>
            <div className="text-sm text-muted-foreground">Total Codes</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="text-2xl font-semibold">{usedAccessCodes.length}</div>
            <div className="text-sm text-muted-foreground">Used Codes</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="text-2xl font-semibold">{unusedAccessCodes.length}</div>
            <div className="text-sm text-muted-foreground">Available Codes</div>
          </div>
        </div>

        {isLoading && users.length === 0 && accessCodes.length === 0 ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-6">
            {/* Active Users Section */}
            {users.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Active Users</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Access Code</TableHead>
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
                            {user.id}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="font-mono bg-muted px-2 py-1 rounded text-sm">
                              {user.accessCode}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(user.accessCode)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.role || 'user'}
                            onValueChange={(value) => handleRoleUpdate(user.id, value)}
                            disabled={updatingRole === user.id}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
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
            )}

            {/* Unused Access Codes Section */}
            {unusedAccessCodes.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Available Access Codes</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unusedAccessCodes.map((accessCode) => (
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
                          {formatToUKDate(accessCode.created_at)}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm"
                                disabled={deletingCode === accessCode.id}
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
                                  onClick={() => handleDeleteAccessCode(accessCode.id)}
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

            {users.length === 0 && accessCodes.length === 0 && (
              <p className="text-muted-foreground text-center py-8">No users or access codes found</p>
            )}
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  );
};