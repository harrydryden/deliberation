import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BackendAuthProvider } from "@/hooks/useBackendAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";

// Component that uses the token refresh hook
const AppWithAuth = () => {
  useTokenRefresh();
  
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/deliberations" element={<Chat />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <ErrorBoundary>
    <BackendAuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppWithAuth />
        </BrowserRouter>
      </TooltipProvider>
    </BackendAuthProvider>
  </ErrorBoundary>
);

export default App;
