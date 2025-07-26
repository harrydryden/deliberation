import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { useBackend } from "@/contexts/BackendContext";
import { ChatInterface } from "@/components/chat/ChatInterface";

const Chat = () => {
  const { useNodeBackend } = useBackend();
  const supabaseAuth = useAuth();
  const backendAuth = useBackendAuth();
  const navigate = useNavigate();

  // Use the appropriate auth based on backend selection
  const { user, isLoading } = useNodeBackend ? backendAuth : supabaseAuth;

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return null;
  if (!user) return null;

  return <ChatInterface />;
};

export default Chat;