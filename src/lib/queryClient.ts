import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000, // 5 minutes - increased for better caching
      gcTime: 10 * 60_000, // 10 minutes - keep data longer
      refetchOnWindowFocus: false,
      retry: 2, // Increased retry for better reliability
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Enable background refetch for better UX
      refetchOnMount: 'always',
      // Reduce network requests for identical queries
      refetchOnReconnect: 'always',
    },
    mutations: {
      retry: 1, // Add some retry for mutations
      retryDelay: 1000,
    },
  },
});
