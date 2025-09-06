import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export function AccessCodeCreation() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode1, setAccessCode1] = useState('');
  const [accessCode2, setAccessCode2] = useState('');
  const { toast } = useToast();

  const generateRandomCodes = () => {
    // Generate 5-letter uppercase code
    const code1 = Array.from({ length: 5 }, () => 
      String.fromCharCode(65 + Math.floor(Math.random() * 26))
    ).join('');
    
    // Generate 6-digit numeric code
    const code2 = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    
    setAccessCode1(code1);
    setAccessCode2(code2);
  };

  const createUserWithAccessCodes = async () => {
    if (!email || !password || !accessCode1 || !accessCode2) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            access_code_1: accessCode1,
            access_code_2: accessCode2
          }
        }
      });

      if (error) throw error;

      toast({
        title: "User Created",
        description: `User created with access codes ${accessCode1} and ${accessCode2}`,
      });

      // Reset form
      setEmail('');
      setPassword('');
      setAccessCode1('');
      setAccessCode2('');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create User with Access Codes</CardTitle>
        <CardDescription>
          Create a new user account with custom access codes that will serve as email/password prefixes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="accessCode1">Access Code 1 (5 letters)</Label>
            <Input
              id="accessCode1"
              value={accessCode1}
              onChange={(e) => setAccessCode1(e.target.value.toUpperCase())}
              placeholder="ABCDE"
              maxLength={5}
              pattern="[A-Z]{5}"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accessCode2">Access Code 2 (6 digits)</Label>
            <Input
              id="accessCode2"
              value={accessCode2}
              onChange={(e) => setAccessCode2(e.target.value)}
              placeholder="123456"
              maxLength={6}
              pattern="[0-9]{6}"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={generateRandomCodes}
            variant="outline"
            type="button"
          >
            Generate Random Codes
          </Button>
          <Button 
            onClick={createUserWithAccessCodes}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create User
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}