import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, Copy, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CreatedUser {
  user_id: string;
  access_code: string;
  profile_created: boolean;
  user_type: string;
}

export const BulkUserCreation = ({ onUsersCreated }: { onUsersCreated: () => void }) => {
  const [userCount, setUserCount] = useState(1);
  const [userType, setUserType] = useState<'user' | 'admin'>('user');
  const [creating, setCreating] = useState(false);
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);

  const handleCreateUsers = async () => {
    if (userCount < 1 || userCount > 50) {
      toast.error('Please enter a number between 1 and 50');
      return;
    }

    setCreating(true);
    try {
      const newUsers: CreatedUser[] = [];
      
      // Create users one by one to ensure proper handling
      for (let i = 0; i < userCount; i++) {
        const { data, error } = await supabase
          .rpc('create_user_with_access_code', {
            p_user_role: userType
          });

        if (error) {
          console.error(`Error creating user ${i + 1}:`, error);
          toast.error(`Failed to create user ${i + 1}`);
          continue;
        }

        if (data && data.length > 0) {
          const userData = data[0];
          newUsers.push({
            ...userData,
            user_type: userType
          });
        }
      }

      setCreatedUsers(newUsers);
      
      if (newUsers.length === userCount) {
        toast.success(`Successfully created ${userCount} ${userType}(s)`);
      } else {
        toast.warning(`Created ${newUsers.length} out of ${userCount} users`);
      }
      
      onUsersCreated();
    } catch (error) {
      console.error('Error creating users:', error);
      toast.error('Failed to create users');
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${type} copied to clipboard`);
  };

  const copyAllAccessCodes = () => {
    const accessCodes = createdUsers.map(user => user.access_code).join('\n');
    navigator.clipboard.writeText(accessCodes);
    toast.success('All access codes copied to clipboard');
  };

  const downloadCSV = () => {
    const headers = ['User ID', 'Access Code', 'User Type', 'Profile Created'];
    const rows = createdUsers.map(user => [
      user.user_id,
      user.access_code,
      user.user_type,
      user.profile_created ? 'Yes' : 'No'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success('User data downloaded as CSV');
  };

  const resetForm = () => {
    setCreatedUsers([]);
    setUserCount(1);
    setUserType('user');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Bulk User Creation
        </CardTitle>
        {createdUsers.length > 0 && (
          <Button onClick={resetForm} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {createdUsers.length === 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="userCount">Number of Users</Label>
                <Input
                  id="userCount"
                  type="number"
                  min={1}
                  max={50}
                  value={userCount}
                  onChange={(e) => setUserCount(parseInt(e.target.value) || 1)}
                  placeholder="Enter number of users"
                />
                <p className="text-sm text-muted-foreground">
                  Maximum 50 users per batch
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="userType">User Type</Label>
                <Select value={userType} onValueChange={(value: 'user' | 'admin') => setUserType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Regular User</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <Button 
              onClick={handleCreateUsers} 
              disabled={creating || userCount < 1 || userCount > 50}
              className="w-full"
              size="lg"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {creating ? `Creating ${userCount} ${userType}(s)...` : `Create ${userCount} ${userType}(s)`}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-green-700 dark:text-green-300">
                Created {createdUsers.length} User(s)
              </h3>
              <div className="flex gap-2">
                <Button onClick={copyAllAccessCodes} variant="outline" size="sm">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All Codes
                </Button>
                <Button onClick={downloadCSV} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Access Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {createdUsers.map((user, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <code className="text-sm bg-muted px-2 py-1 rounded">
                          {user.user_id.slice(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                          {user.access_code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.user_type === 'admin' ? 'default' : 'secondary'}>
                          {user.user_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.profile_created ? 'default' : 'destructive'}>
                          {user.profile_created ? 'Created' : 'Failed'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(user.access_code, 'Access Code')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                Important Instructions:
              </h4>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li>• Share the access codes with the respective users</li>
                <li>• Users will need their access code to authenticate</li>
                <li>• Access codes are automatically linked to user profiles</li>
                <li>• Admin users have elevated permissions in the system</li>
                <li>• Download the CSV file to keep a record of created users</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};