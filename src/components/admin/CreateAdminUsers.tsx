import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function CreateAdminUsers() {
  const [isCreating, setIsCreating] = useState(false);
  const { createAdminUsers } = useSupabaseAuth();
  const { toast } = useToast();

  const handleCreateUsers = async () => {
    setIsCreating(true);
    try {
      const result = await createAdminUsers();
      
      if (result.success) {
        toast({
          title: 'Admin users created',
          description: 'ADMIN/12345 and SUPER/54321 users have been created'
        });
      } else {
        toast({
          title: 'Error creating users',
          description: 'There was an error creating the admin users',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error creating users:', error);
      toast({
        title: 'Error creating users',
        description: 'There was an error creating the admin users',
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Admin Users</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          This will create two admin users:
          <br />• ADMIN / 12345
          <br />• SUPER / 54321
        </p>
        
        <Button onClick={handleCreateUsers} disabled={isCreating}>
          {isCreating ? 'Creating...' : 'Create Admin Users'}
        </Button>
      </CardContent>
    </Card>
  );
}