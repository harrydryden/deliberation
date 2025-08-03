import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield } from "lucide-react";
import { getErrorMessage, ValidationError } from "@/utils/errors";
import { accessCodeSchema, sanitizeInput, validateAndSanitize } from "@/utils/validation";
import { authRateLimit, logSecurityEvent } from "@/utils/security";

export const AuthForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [validationError, setValidationError] = useState<string>("");
  const [remainingTime, setRemainingTime] = useState(0);
  const { authenticate } = useBackendAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Rate limiting countdown
  useEffect(() => {
    if (remainingTime > 0) {
      const timer = setInterval(() => {
        setRemainingTime(prev => Math.max(0, prev - 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [remainingTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Rate limiting check
    const clientId = `auth_${window.navigator.userAgent.slice(0, 20)}`;
    if (!authRateLimit.canAttempt(clientId)) {
      const timeLeft = authRateLimit.getRemainingTime(clientId);
      setRemainingTime(timeLeft);
      toast({
        variant: "destructive",
        title: "Too Many Attempts",
        description: `Please wait ${Math.ceil(timeLeft / 60000)} minutes before trying again.`
      });
      logSecurityEvent('auth_rate_limited', { clientId, timeLeft });
      return;
    }

    // Enhanced validation with security measures
    const sanitizedCode = sanitizeInput(accessCode);
    const validation = validateAndSanitize(accessCodeSchema, sanitizedCode);
    
    if (!validation.success) {
      const errorMessage = 'error' in validation ? validation.error : 'Validation failed';
      setValidationError(errorMessage);
      toast({
        variant: "destructive", 
        title: "Invalid Access Code",
        description: errorMessage
      });
      logSecurityEvent('auth_invalid_format', { code: accessCode.replace(/./g, '*') });
      return;
    }

    setValidationError("");
    
    setIsLoading(true);
    console.log('🚀 Starting authentication process with code:', validation.data);
    
    try {
      await authenticate(validation.data);
      console.log('✅ Authentication successful, letting Auth page handle redirect...');
      authRateLimit.reset(clientId); // Reset on success
      logSecurityEvent('auth_success', { timestamp: Date.now() });
      toast({
        title: "Welcome!",
        description: "Successfully authenticated"
      });
      // Remove manual navigation - let Auth page handle redirect
    } catch (error: any) {
      console.error('❌ Authentication failed:', error);
      logSecurityEvent('auth_failed', { 
        error: error.message, 
        timestamp: Date.now(),
        userAgent: window.navigator.userAgent.slice(0, 50)
      });
      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: getErrorMessage(error)
      });
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-deliberation-bg p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Shield className="h-6 w-6 text-democratic-blue mr-2" />
            <CardTitle className="text-2xl font-bold text-democratic-blue">
              Secure Access
            </CardTitle>
          </div>
          <CardDescription>
            Enter your access code to join the deliberation
          </CardDescription>
          {remainingTime > 0 && (
            <div className="text-sm text-red-600 mt-2">
              Rate limited. Try again in {Math.ceil(remainingTime / 60000)} minutes.
            </div>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accessCode">Access Code</Label>
              <Input 
                id="accessCode" 
                type="text" 
                placeholder="Enter 10-character access code"
                value={accessCode}
                maxLength={10}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^A-Z0-9]/gi, '').toUpperCase(); // Allow alphanumeric
                  setAccessCode(value);
                  if (validationError) setValidationError("");
                }}
                required 
                className={`text-center text-lg ${validationError ? 'border-red-500' : ''}`}
              />
              {validationError && (
                <p className="text-sm text-red-600 mt-1">{validationError}</p>
              )}
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-democratic-blue hover:bg-democratic-blue/90" 
              disabled={isLoading || accessCode.length < 1 || remainingTime > 0}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Join Deliberation
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};