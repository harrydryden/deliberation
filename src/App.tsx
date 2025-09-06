import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider as SupabaseAuthProvider } from "@/hooks/useSupabaseAuth";
import { OptimizedAuthProvider, useOptimizedAuthContext } from "@/components/auth/OptimizedAuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Suspense, lazy } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

// Authentication guard component
const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useOptimizedAuthContext();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
};

// Admin guard component
const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, isLoading } = useOptimizedAuthContext();
  
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
const AdminDeliberationView = lazy(() => import("./components/admin/AdminDeliberationView").then(module => ({ default: module.AdminDeliberationView })));
const Deliberations = lazy(() => import("./pages/Deliberations"));
const DeliberationChat = lazy(() => import("./pages/DeliberationChat"));
const UserMetrics = lazy(() => import("./pages/UserMetrics"));

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <SupabaseAuthProvider>
        <OptimizedAuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-center space-y-4"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" /><p className="text-muted-foreground">Loading...</p></div></div>}>
                <Routes>
                  <Route path="/" element={<AuthGuard><Index /></AuthGuard>} />
                  <Route path="/auth" element={<Auth />} />
                  
                  <Route path="/admin" element={<AuthGuard><AdminGuard><Admin /></AdminGuard></AuthGuard>} />
                  <Route path="/admin/deliberations/:deliberationId" element={<AuthGuard><AdminGuard><AdminDeliberationView /></AdminGuard></AuthGuard>} />
                  <Route path="/deliberations" element={<AuthGuard><Deliberations /></AuthGuard>} />
                  <Route path="/deliberations/:deliberationId" element={<AuthGuard><DeliberationChat /></AuthGuard>} />
                  <Route path="/metrics" element={<AuthGuard><UserMetrics /></AuthGuard>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </OptimizedAuthProvider>
      </SupabaseAuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
