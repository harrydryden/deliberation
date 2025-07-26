import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { useBackend } from "@/contexts/BackendContext";
import { AuthForm } from "@/components/auth/AuthForm";

const Auth = () => {
  const { useNodeBackend } = useBackend();
  const supabaseAuth = useAuth();
  const navigate = useNavigate();
  
  // Only use backend auth when Node backend is selected
  const backendAuth = useNodeBackend ? useBackendAuth() : { user: null, isLoading: false };
  
  // Use the appropriate auth based on backend selection
  const { user, isLoading } = useNodeBackend ? backendAuth : supabaseAuth;

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/chat");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return null;
  if (user) return null;

  return <AuthForm />;
};

export default Auth;