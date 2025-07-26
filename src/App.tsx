import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { BackendAuthProvider } from "@/hooks/useBackendAuth";
import { BackendProvider, useBackend } from "@/contexts/BackendContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";

const queryClient = new QueryClient();

const AppContent = () => {
  const { useNodeBackend } = useBackend();
  
  const AuthComponent = useNodeBackend ? BackendAuthProvider : AuthProvider;
  
  return (
    <QueryClientProvider client={queryClient}>
      <AuthComponent>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/deliberations" element={<Chat />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthComponent>
    </QueryClientProvider>
  );
};

const App = () => (
  <BackendProvider>
    <AppContent />
  </BackendProvider>
);

export default App;
