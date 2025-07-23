import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AuthForm } from "@/components/auth/AuthForm";

const Auth = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/deliberations");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return null;
  if (user) return null;

  return <AuthForm />;
};

export default Auth;