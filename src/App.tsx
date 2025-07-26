import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BackendAuthProvider } from "@/hooks/useBackendAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthLoadingBoundary } from "@/components/auth/AuthLoadingBoundary";
import { BackendSelector } from "@/components/auth/BackendSelector";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";
import Deliberations from "./pages/Deliberations";
import DeliberationChat from "./pages/DeliberationChat";

const App = () => (
  <ErrorBoundary>
    <AuthLoadingBoundary>
      <BackendAuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/backend" element={<BackendSelector />} />
              <Route path="/deliberations" element={<Deliberations />} />
              <Route path="/deliberations/:deliberationId" element={<DeliberationChat />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </BackendAuthProvider>
    </AuthLoadingBoundary>
  </ErrorBoundary>
);

export default App;
