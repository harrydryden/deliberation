import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function CreateAdminUsers() {
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const createUsers = async () => {
    setIsCreating(true);
    try {
      // Create ADMIN user
      const { data: adminData, error: adminError } = await supabase.auth.signUp({
        email: 'ADMIN@deliberation.local',
        password: '12345',
        options: {
          data: {
            access_code_1: 'ADMIN',
            access_code_2: '12345',
            role: 'admin'
          }
        }
      });

      if (adminError) {
        console.error('Error creating admin user:', adminError);
      } else {
        console.log('Admin user created successfully', adminData);
      }

      // Create SUPER user
      const { data: superData, error: superError } = await supabase.auth.signUp({
        email: 'SUPER@deliberation.local',
        password: '54321',
        options: {
          data: {
            access_code_1: 'SUPER',
            access_code_2: '54321',
            role: 'admin'
          }
        }
      });

      if (superError) {
        console.error('Error creating super user:', superError);
      } else {
        console.log('Super user created successfully', superData);
      }

      toast({
        title: 'Admin users created',
        description: 'ADMIN/12345 and SUPER/54321 users have been created'
      });

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
        
        <Button onClick={createUsers} disabled={isCreating}>
          {isCreating ? 'Creating...' : 'Create Admin Users'}
        </Button>
      </CardContent>
    </Card>
  );
}