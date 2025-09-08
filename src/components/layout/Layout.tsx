import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Header } from "./Header";
import { Loader2 } from "lucide-react";
import { memo } from "react";
import { LayoutErrorBoundary } from './LayoutErrorBoundary';
import { ConsolidatedErrorBoundary } from '@/components/common/ConsolidatedErrorBoundary';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = memo(({ children }: LayoutProps) => {
  const { isLoading } = useSupabaseAuth();

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

  return (
    <LayoutErrorBoundary>
      <ConsolidatedErrorBoundary context="Layout">
        <div className="min-h-screen bg-deliberation-bg">
          <Header />
          <main className="container mx-auto px-4 py-4">
            {children}
          </main>
        </div>
      </ConsolidatedErrorBoundary>
    </LayoutErrorBoundary>
  );
});