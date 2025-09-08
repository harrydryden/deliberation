import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSupabaseAuth, AuthProvider as SupabaseAuthProvider } from "@/hooks/useSupabaseAuth";
import { ProductionErrorBoundary } from "@/components/common/ProductionErrorBoundary";
import { ProductionOptimizedProvider } from "@/components/layout/ProductionOptimizedProvider";
import { Loader2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { queryClient } from "@/lib/queryClient";

// Authentication Guard Component
const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useSupabaseAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-deliberation-bg">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-democratic-blue" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <Layout>{children}</Layout>;
};

// Admin guard component  
const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, isLoading } = useSupabaseAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!isAdmin) {
    return <Navigate to="/deliberations" replace />;
  }
  
  return <>{children}</>;
};

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Admin = lazy(() => import("./pages/Admin"));
const Deliberations = lazy(() => import("./pages/Deliberations"));
const DeliberationChat = lazy(() => import("./pages/DeliberationChat"));
const UserMetrics = lazy(() => import("./pages/UserMetrics"));

const App = () => (
  <ProductionErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <SupabaseAuthProvider>
      <ProductionOptimizedProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-center space-y-4"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" /><p className="text-muted-foreground">Loading...</p></div></div>}>
              <Routes>
                <Route path="/" element={<AuthGuard><Index /></AuthGuard>} />
                <Route path="/auth" element={<Auth />} />
                
                <Route path="/admin" element={<AuthGuard><AdminGuard><Admin /></AdminGuard></AuthGuard>} />
                <Route path="/deliberations" element={<AuthGuard><Deliberations /></AuthGuard>} />
                <Route path="/deliberations/:deliberationId" element={<AuthGuard><DeliberationChat /></AuthGuard>} />
                <Route path="/metrics" element={<AuthGuard><UserMetrics /></AuthGuard>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </ProductionOptimizedProvider>
      </SupabaseAuthProvider>
    </QueryClientProvider>
  </ProductionErrorBoundary>
);

export default App;
