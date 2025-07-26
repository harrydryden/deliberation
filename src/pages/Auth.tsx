import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { AuthForm } from "@/components/auth/AuthForm";

const Auth = () => {
  const { user, isLoading } = useBackendAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      console.log('✅ User authenticated, redirecting to deliberations:', user);
      navigate("/deliberations");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }
  
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Redirecting to deliberations...</div>
      </div>
    );
  }

  return <AuthForm />;
};

export default Auth;