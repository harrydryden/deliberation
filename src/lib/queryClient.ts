import { QueryClient } from "@tanstack/react-query";
import { isProduction } from "@/utils/productionConfig";

// Production-optimized configuration to reduce memory usage
const createQueryClientConfig = () => {
  if (isProduction) {
    return {
      defaultOptions: {
        queries: {
          staleTime: 2 * 60_000, // 2 minutes - shorter for production
          gcTime: 5 * 60_000, // 5 minutes - aggressive cleanup
          refetchOnWindowFocus: false,
          retry: 1, // Fewer retries to reduce load
          retryDelay: 1000,
          refetchOnMount: false, // Prevent excessive refetching
          refetchOnReconnect: false, // Only refetch when explicitly needed
        },
        mutations: {
          retry: 0, // No retries for mutations in production
        },
      },
    };
  }
  
  // Development configuration - more aggressive caching for better DX
  return {
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        retry: 2,
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
        refetchOnMount: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 1,
        retryDelay: 1000,
      },
    },
  };
};

export const queryClient = new QueryClient(createQueryClientConfig());
