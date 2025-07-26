import { useEffect } from "react";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";
import { useNavigate } from "react-router-dom";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { ChatInterface } from "@/components/chat/ChatInterface";

const Chat = () => {
  const { user, isLoading } = useBackendAuth();
  const navigate = useNavigate();
  
  // Enable token refresh for authenticated users
  useTokenRefresh();

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