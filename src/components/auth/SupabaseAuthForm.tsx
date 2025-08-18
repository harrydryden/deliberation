import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

export const SupabaseAuthForm = () => {
  const [accessCode1, setAccessCode1] = useState('');
  const [accessCode2, setAccessCode2] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { signIn } = useSupabaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const validateAccessCodes = () => {
    // Validate Access Code 1: 5 letters
    if (!/^[A-Z]{5}$/.test(accessCode1.toUpperCase())) {
      setError('Access Code 1 must be exactly 5 letters');
      return false;
    }
    
    // Validate Access Code 2: 5 digits
    if (!/^\d{5}$/.test(accessCode2)) {
      setError('Access Code 2 must be exactly 5 digits');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!validateAccessCodes()) {
      setIsLoading(false);
      return;
    }

    try {
      // Transform Access Code 1 to email format
      const email = `${accessCode1.toUpperCase()}@deliberation.local`;
      const password = accessCode2;
      
      console.log('Attempting to sign in with:', { email, password: '***' });
      
      const result = await signIn(email, password);
      
      console.log('Sign in result:', { error: result.error, hasError: !!result.error });

      if (result.error) {
        console.error('Authentication error:', result.error);
        setError('Invalid access codes. Please check your Access Code 1 and Access Code 2.');
      } else {
        toast({
          title: 'Signed in successfully',
          description: 'Welcome to the deliberation platform!',
        });
        
        navigate('/admin');
      }
    } catch (err: any) {
      console.error('Auth exception:', err);
      setError('Invalid access codes. Please check your Access Code 1 and Access Code 2.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Deliberation Platform
          </CardTitle>
          <CardDescription>
            Access the deliberation management system
          </CardDescription>
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded">
            <p className="text-sm text-destructive font-medium">Setup Required:</p>
            <p className="text-xs text-muted-foreground mt-1">
              1. Enable "Allow new users to sign up" in Supabase Auth Settings<br/>
              2. Go to /setup to create admin users<br/>
              3. Return here to sign in with ADMIN/12345
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="access-code-1">Access Code 1</Label>
              <Input
                id="access-code-1"
                type="text"
                value={accessCode1}
                onChange={(e) => setAccessCode1(e.target.value.toUpperCase())}
                placeholder="5 letters (e.g., ABCDE)"
                maxLength={5}
                className="font-mono text-center uppercase"
                required
              />
              <p className="text-sm text-muted-foreground">
                Enter exactly 5 letters
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="access-code-2">Access Code 2</Label>
              <Input
                id="access-code-2"
                type="text"
                inputMode="numeric"
                value={accessCode2}
                onChange={(e) => setAccessCode2(e.target.value.replace(/\D/g, ''))}
                placeholder="5 digits (e.g., 12345)"
                maxLength={5}
                className="font-mono text-center"
                required
              />
              <p className="text-sm text-muted-foreground">
                Enter exactly 5 digits
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Access Platform'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};