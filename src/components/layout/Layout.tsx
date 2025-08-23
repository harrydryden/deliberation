import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Header } from "./Header";
import { Loader2 } from "lucide-react";
import { memo } from "react";

interface LayoutProps {
  children: React.ReactNode;
  notion?: string;
}

export const Layout = memo(({ children, notion }: LayoutProps) => {
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
    <div className="min-h-screen bg-deliberation-bg">
      <Header notion={notion} />
      <main className="container mx-auto px-4 py-4">
        {children}
      </main>
    </div>
  );
});