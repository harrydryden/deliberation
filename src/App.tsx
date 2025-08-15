import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ServiceProvider } from "@/hooks/useServices";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthLoadingBoundary } from "@/components/auth/AuthLoadingBoundary";
import { useServices } from "@/hooks/useServices";
import { Suspense, lazy } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Admin = lazy(() => import("./pages/Admin"));
const Deliberations = lazy(() => import("./pages/Deliberations"));
const DeliberationChat = lazy(() => import("./pages/DeliberationChat"));

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ServiceProvider>
        <AuthLoadingBoundary>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-center space-y-4"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" /><p className="text-muted-foreground">Loading...</p></div></div>}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  {/* chat deprecated */}
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/backend" element={<div>Backend configuration removed</div>} />
                  <Route path="/deliberations" element={<Deliberations />} />
                  <Route path="/deliberations/:deliberationId" element={<DeliberationChat />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </AuthLoadingBoundary>
      </ServiceProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
