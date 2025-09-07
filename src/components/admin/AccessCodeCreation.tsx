import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users } from 'lucide-react';
import { logger } from '@/utils/logger';

export function AccessCodeCreation() {
  const [isLoading, setIsLoading] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [createdUsers, setCreatedUsers] = useState<Array<{code1: string, code2: string, email: string}>>([]);
  const { toast } = useToast();

  const generateRandomAccessCodes = () => {
    // Generate 5-letter uppercase code
    const code1 = Array.from({ length: 5 }, () => 
      String.fromCharCode(65 + Math.floor(Math.random() * 26))
    ).join('');
    
    // Generate 6-digit numeric code
    const code2 = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    
    return { code1, code2 };
  };

  const createBulkUsers = async () => {
    if (userCount < 1 || userCount > 50) {
      toast({
        title: "Invalid Count",
        description: "Please enter a number between 1 and 50",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    const newUsers: Array<{code1: string, code2: string, email: string}> = [];
    let successCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < userCount; i++) {
        const { code1, code2 } = generateRandomAccessCodes();
        const email = `${code1}@deliberation.local`;
        const password = code2; // Use access code 2 as password

        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/`,
              data: {
                access_code_1: code1,
                access_code_2: code2,
                role: 'user'
              }
            }
          });

          if (error) {
            logger.error('Error creating user', { userIndex: i + 1, error });
            errorCount++;
          } else {
            newUsers.push({ code1, code2, email });
            successCount++;
          }
        } catch (error) {
          logger.error('Exception creating user', { userIndex: i + 1, error });
          errorCount++;
        }
      }

      setCreatedUsers(prev => [...prev, ...newUsers]);

      toast({
        title: "Bulk User Creation Complete",
        description: `Successfully created ${successCount} users${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        variant: successCount > 0 ? "default" : "destructive"
      });

    } catch (error: any) {
      toast({
        title: "Bulk Creation Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
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
          <CardDescription>
            Create multiple users with randomly generated access codes. Each user gets a 5-letter access code as email prefix and 6-digit password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="userCount">Number of users to create (1-50)</Label>
            <Input
              id="userCount"
              type="number"
              min={1}
              max={50}
              value={userCount}
              onChange={(e) => setUserCount(parseInt(e.target.value) || 1)}
              placeholder="5"
            />
          </div>

          <Button 
            onClick={createBulkUsers}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create {userCount} User{userCount !== 1 ? 's' : ''}
          </Button>
        </CardContent>
      </Card>

      {createdUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recently Created Users</CardTitle>
            <CardDescription>
              Access codes and login details for newly created users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {createdUsers.slice(-20).map((user, index) => (
                <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                  <div className="font-mono text-sm">
                    <div className="font-medium">{user.email}</div>
                    <div className="text-muted-foreground">Password: {user.code2}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Codes: {user.code1} / {user.code2}
                  </div>
                </div>
              ))}
            </div>
            {createdUsers.length > 20 && (
              <p className="text-sm text-muted-foreground mt-2">
                Showing last 20 users. Total created: {createdUsers.length}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}