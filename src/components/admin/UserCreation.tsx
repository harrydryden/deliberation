import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Copy, User, Key } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface NewUser {
  user_id: string;
  access_code: string;
  profile_created: boolean;
}

export const UserCreation = ({ onUserCreated }: { onUserCreated: () => void }) => {
  const [userRole, setUserRole] = useState('user');
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState<NewUser | null>(null);

  const handleCreateUser = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase
        .rpc('create_user_with_access_code', {
          p_user_role: userRole,
          p_display_name: null
        });

      if (error) {
        console.error('Error creating user:', error);
        toast.error('Failed to create user');
        return;
      }

      if (data && data.length > 0) {
        const userData = data[0];
        setNewUser(userData);
        setUserRole('user');
        toast.success('User created successfully!');
        onUserCreated();
      }
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${type} copied to clipboard`);
  };

  const resetForm = () => {
    setNewUser(null);
    setUserRole('user');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Create New User
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!newUser ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userRole">User Role</Label>
              <Select value={userRole} onValueChange={setUserRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              onClick={handleCreateUser} 
              disabled={creating}
              className="w-full"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {creating ? 'Creating User...' : 'Create User'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <h3 className="font-semibold text-green-800 dark:text-green-200 mb-3">
                User Created Successfully!
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded border">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">User ID:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                      {newUser.user_id}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(newUser.user_id, 'User ID')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded border">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Access Code:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                      {newUser.access_code}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(newUser.access_code, 'Access Code')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded border">
                  <span className="font-medium">Profile Status:</span>
                  <Badge variant={newUser.profile_created ? 'default' : 'destructive'}>
                    {newUser.profile_created ? 'Created' : 'Failed'}
                  </Badge>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Important:</strong> Share the access code with the user. They'll need it to log into the system.
                  The user ID and access code are automatically linked in the database.
                </p>
              </div>
            </div>
            
            <Button onClick={resetForm} variant="outline" className="w-full">
              Create Another User
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};