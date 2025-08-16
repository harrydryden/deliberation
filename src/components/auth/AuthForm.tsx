import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useServices } from "@/hooks/useServices";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Network } from "lucide-react";
import { getErrorMessage, ValidationError } from "@/utils/errors";
import { accessCodeSchema, sanitizeInput, validateAndSanitize } from "@/utils/validation";
import { SecureAuthService } from "@/services/secureAuth.service";
import { validateInputSecure, authRateLimit } from "@/utils/securityEnhanced";
import { logger } from '@/utils/logger';

export const AuthForm = () => {
  console.log('🔍 AuthForm component rendering');
  const [isLoading, setIsLoading] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [validationError, setValidationError] = useState<string>("");
  const [remainingTime, setRemainingTime] = useState(0);
  
  const { authenticateWithAccessCode } = useAuth();
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

    const clientId = `auth_${window.navigator.userAgent.slice(0, 20)}`;
    
    // Enhanced rate limiting check
    const rateLimitResult = authRateLimit.canAttempt(clientId);
    if (!rateLimitResult.allowed) {
      const timeLeft = rateLimitResult.remainingTime || 0;
      setRemainingTime(timeLeft);
      toast({
        variant: "destructive",
        title: "Too Many Attempts",
        description: `Please wait ${Math.ceil(timeLeft / 60000)} minutes before trying again.`
      });
      return;
    }

    // Sanitize and validate input with enhanced security
    const sanitizedCode = sanitizeInput(accessCode);
    const securityValidation = validateInputSecure(sanitizedCode, 'accessCode');
    
    if (!securityValidation.isValid) {
      setValidationError(securityValidation.errors.join(', '));
      toast({
        variant: "destructive", 
        title: "Invalid Access Code",
        description: securityValidation.errors[0]
      });
      return;
    }
    
    // Check for security threats
    if (securityValidation.threats.length > 0) {
      setValidationError('Security violation detected');
      toast({
        variant: "destructive", 
        title: "Security Violation",
        description: "Invalid characters detected in access code"
      });
      return;
    }

    // Schema validation for final check
    const validation = validateAndSanitize(accessCodeSchema, securityValidation.sanitized!);
    
    if (!validation.success) {
      const errorMessage = 'error' in validation ? validation.error : 'Validation failed';
      setValidationError(errorMessage);
      toast({
        variant: "destructive", 
        title: "Invalid Access Code",
        description: errorMessage
      });
      return;
    }

    setValidationError("");
    setIsLoading(true);
    logger.auth.start('Starting secure authentication process', { accessCode: validation.data });
    
    
    try {
      const result = await SecureAuthService.authenticateWithAccessCode(validation.data);
      
      if (result.success && result.user) {
        logger.auth.success('Secure authentication successful');
        authRateLimit.reset(clientId);
        
        // Set the user in the auth context
        await authenticateWithAccessCode(result.user.accessCode, result.user.role);
        
        toast({
          title: "Welcome - login successful",
          description: ""
        });
        
        // Navigation will be handled by Auth.tsx since we now have a user in context
      } else {
        setValidationError(result.error || 'Authentication failed');
        toast({
          variant: "destructive",
          title: "Authentication Failed",
          description: result.error || 'Please check your access code and try again'
        });
      }
    } catch (error: any) {
      logger.auth.failure('Secure authentication failed', error);
      setValidationError('Authentication system error');
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "System temporarily unavailable. Please try again."
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  console.log('🔍 AuthForm about to render JSX, accessCode:', accessCode);
  console.log('🔍 AuthForm validation state:', { validationError, isLoading, remainingTime });
  return (
    <div className="min-h-screen flex items-center justify-center bg-deliberation-bg p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Network className="h-6 w-6 text-democratic-blue mr-2" />
            <CardTitle className="text-2xl font-bold text-democratic-blue">
              Deliberation
            </CardTitle>
          </div>
          <CardDescription>
            welcome to the conversation
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
              Open
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};