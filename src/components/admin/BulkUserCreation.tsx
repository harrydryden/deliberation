import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CreatedUser {
  email: string;
  access_code_1: string;
  access_code_2: string;
  role: string;
  password: string;
}

interface BulkUserCreationProps {
  onUsersCreated: () => void;
}

export const BulkUserCreation = ({ onUsersCreated }: BulkUserCreationProps) => {
  const [userCount, setUserCount] = useState(5);
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  const [isCreating, setIsCreating] = useState(false);
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const generateAccessCode1 = (): string => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  };

  const generateAccessCode2 = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const generatePassword = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const handleBulkCreate = async () => {
    if (userCount < 1 || userCount > 50) {
      toast({
        title: "Invalid Count",
        description: "Please enter a number between 1 and 50.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    const newUsers: CreatedUser[] = [];
    const errors: string[] = [];

    try {
      for (let i = 0; i < userCount; i++) {
        const accessCode1 = generateAccessCode1();
        const accessCode2 = generateAccessCode2();
        const password = generatePassword();
        const email = `${accessCode1.toLowerCase()}@temp-access.com`;

        try {
          const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            user_metadata: {
              access_code_1: accessCode1,
              access_code_2: accessCode2,
              role: userRole
            },
            email_confirm: true // Skip email confirmation
          });

          if (error) {
            errors.push(`User ${i + 1}: ${error.message}`);
          } else if (data.user) {
            newUsers.push({
              email,
              access_code_1: accessCode1,
              access_code_2: accessCode2,
              role: userRole,
              password
            });
          }
        } catch (err) {
          errors.push(`User ${i + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      setCreatedUsers(newUsers);

      if (newUsers.length > 0) {
        toast({
          title: "Users Created",
          description: `Successfully created ${newUsers.length} users${errors.length > 0 ? ` (${errors.length} failed)` : ''}.`,
        });
        onUsersCreated();
      }

      if (errors.length > 0) {
        console.error('Bulk creation errors:', errors);
        toast({
          title: "Some Errors Occurred",
          description: `${errors.length} users failed to create. Check console for details.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Bulk creation failed:', error);
      toast({
        title: "Creation Failed",
        description: "Failed to create users. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const copyUserDetails = async (user: CreatedUser, index: number) => {
    const details = `Email: ${user.email}\nAccess Code 1: ${user.access_code_1}\nAccess Code 2: ${user.access_code_2}\nPassword: ${user.password}\nRole: ${user.role}`;
    
    try {
      await navigator.clipboard.writeText(details);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      toast({
        title: "Copied!",
        description: "User details copied to clipboard.",
      });
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  const copyAllUsers = async () => {
    const allDetails = createdUsers.map(user => 
      `Email: ${user.email} | Access Code 1: ${user.access_code_1} | Access Code 2: ${user.access_code_2} | Password: ${user.password} | Role: ${user.role}`
    ).join('\n');
    
    try {
      await navigator.clipboard.writeText(allDetails);
      toast({
        title: "All Users Copied!",
        description: "All user details copied to clipboard.",
      });
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk User Creation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="userCount">Number of Users (1-50)</Label>
              <Input
                id="userCount"
                type="number"
                min="1"
                max="50"
                value={userCount}
                onChange={(e) => setUserCount(parseInt(e.target.value) || 1)}
                disabled={isCreating}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="userRole">User Role</Label>
              <Select value={userRole} onValueChange={(value: 'user' | 'admin') => setUserRole(value)} disabled={isCreating}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleBulkCreate}
            disabled={isCreating}
            className="w-full"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Users...
              </>
            ) : (
              <>
                <Users className="mr-2 h-4 w-4" />
                Create {userCount} Users
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {createdUsers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Created Users ({createdUsers.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={copyAllUsers}>
                <Copy className="mr-2 h-4 w-4" />
                Copy All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {createdUsers.map((user, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1 space-y-1">
                    <div className="font-medium">{user.email}</div>
                    <div className="text-sm text-muted-foreground">
                      Access: {user.access_code_1} / {user.access_code_2} | Password: {user.password}
                    </div>
                    <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'}>
                      {user.role}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyUserDetails(user, index)}
                  >
                    {copiedIndex === index ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};