import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeliberationService } from "@/hooks/useDeliberationService";
import { toast } from "sonner";

const Auth = () => {
  const { user, isLoading, isAdmin, signIn } = useSupabaseAuth();
  const navigate = useNavigate();
  const deliberationService = useDeliberationService();
  const [deliberations, setDeliberations] = useState<any[]>([]);
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      loadDeliberations();
    }
  }, [user, isLoading]);

  const loadDeliberations = async () => {
    try {
      // Check if user is admin and redirect accordingly
      if (isAdmin) {
        navigate('/admin');
        return;
      }
      
      const data = await deliberationService.getDeliberations();
      setDeliberations(data);
      
      if (data.length > 0) {
        // Find most recent active deliberation, or fallback to most recent
        const mostRecentDeliberation = data.find(d => d.status === 'active') || data[0];
        navigate(`/deliberations/${mostRecentDeliberation.id}`);
      } else {
        // No deliberations available, redirect to deliberations page
        navigate("/deliberations");
      }
    } catch (error) {
      // Check if user is admin even if deliberations fail to load
      if (isAdmin) {
        navigate('/admin');
      } else {
        // Fallback to deliberations page
        navigate("/deliberations");
      }
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    
    try {
      const { error } = await signIn(email, password);
      
      if (error) {
        toast.error(error.message || 'Sign in failed');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSigningIn(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }
  
  if (user) {
    const destinationText = isAdmin ? 'admin dashboard' : 'deliberations';
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Redirecting to {destinationText}...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Sign In</CardTitle>
          <CardDescription className="text-center">
            Enter your email and password to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSigningIn}
            >
              {isSigningIn ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;