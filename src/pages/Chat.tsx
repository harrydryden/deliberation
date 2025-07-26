import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { ChatInterface } from "@/components/chat/ChatInterface";

const Chat = () => {
  const { user, isLoading } = useBackendAuth();
  const navigate = useNavigate();

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