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

  if (isLoading) return null;
  if (user) return null;

  return <AuthForm />;
};

export default Auth;