import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Archive, ArchiveRestore, Users } from 'lucide-react';
import { User } from '@/types/index';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { AdminTable } from './AdminTable';

interface UserManagementProps {
  users: User[];
  loading: boolean;
  onLoad: () => void;
  onUpdateRole: (userId: string, role: string) => void;
  onArchive: (userId: string, reason?: string) => void;
  onUnarchive: (userId: string) => void;
}

export function UserManagement({ users, loading, onLoad, onUpdateRole, onArchive, onUnarchive }: UserManagementProps) {
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [unarchiving, setUnarchiving] = useState<string | null>(null);

  useEffect(() => {
    if (!users || users.length === 0) {
      onLoad();
    }
  }, [users, onLoad]);

  const handleRoleUpdate = async (userId: string, newRole: string) => {
    setUpdatingRole(userId);
    try {
      await onUpdateRole(userId, newRole);
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleArchive = async (userId: string, reason?: string) => {
    setArchiving(userId);
    try {
      await onArchive(userId, reason);
    } finally {
      setArchiving(null);
    }
  };

  const handleUnarchive = async (userId: string) => {
    setUnarchiving(userId);
    try {
      await onUnarchive(userId);
    } finally {
      setUnarchiving(null);
    }
  };

  const columns = [
    {
      key: 'email',
      header: 'User Details',
      render: (user: User) => (
        <div>
          <div className="font-medium">{user.profile?.displayName || 'Unknown User'}</div>
          <div className="text-sm text-muted-foreground font-mono">{user.email}</div>
        </div>
      )
    },
    {
      key: 'accessCodes',
      header: 'Access Codes',
      render: (user: User) => (
        <div className="font-mono text-sm">
          <div>{user.accessCode1 || 'Not set'}</div>
          <div className="text-muted-foreground">{user.accessCode2 || 'Not set'}</div>
        </div>
      )
    },
    {
      key: 'role',
      header: 'Role',
      render: (user: User) => (
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
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (user: User) => (
        user.isArchived ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-destructive rounded-full"></div>
            <span className="text-sm text-destructive">Archived</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-green-600">Active</span>
          </div>
        )
      )
    },
    {
      key: 'deliberations',
      header: 'Deliberations',
      render: (user: User) => (
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
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (user: User) => (
        <div className="flex gap-2">
          {user.isArchived ? (
            <Button 
              variant="outline" 
              size="sm"
              disabled={unarchiving === user.id}
              onClick={() => handleUnarchive(user.id)}
            >
              {unarchiving === user.id ? (
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
                  disabled={archiving === user.id}
                >
                  {archiving === user.id ? (
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
                    onClick={() => handleArchive(user.id, 'Archived by admin')}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Archive User
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )
    }
  ];

  return (
    <AdminTable
      title="User Management"
      icon={<Users className="h-5 w-5" />}
      items={users}
      columns={columns}
      loading={loading}
      onRefresh={onLoad}
      emptyMessage="No users found"
      description={`Manage user roles and access. Total users: ${users.length}${
        users.filter(u => u.isArchived).length > 0 
          ? ` (${users.filter(u => u.isArchived).length} archived)` 
          : ''
      }`}
    />
  );
}