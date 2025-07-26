import { useEffect, useCallback } from 'react';
import { useBackendAuth } from '@/hooks/useBackendAuth';
import { authService } from '@/services/auth.service';

const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry

export const useTokenRefresh = () => {
  const { refreshToken, signOut, isAuthenticated } = useBackendAuth();

  const scheduleTokenRefresh = useCallback(() => {
    if (!isAuthenticated || !authService.hasValidToken()) {
      return;
    }

    const token = authService.getToken();
    if (!token) return;

    try {
      // Parse token to get expiry
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiryTime = payload.exp * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const timeUntilExpiry = expiryTime - currentTime;
      const timeUntilRefresh = timeUntilExpiry - REFRESH_THRESHOLD;

      if (timeUntilRefresh > 0) {
        setTimeout(async () => {
          try {
            await refreshToken();
            // Schedule next refresh
            scheduleTokenRefresh();
          } catch (error) {
            console.error('Token refresh failed:', error);
            signOut();
          }
        }, timeUntilRefresh);
      } else {
        // Token is about to expire or has expired, refresh immediately
        refreshToken().catch(() => signOut());
      }
    } catch (error) {
      console.error('Error parsing token for refresh:', error);
      signOut();
    }
  }, [isAuthenticated, refreshToken, signOut]);

  useEffect(() => {
    if (isAuthenticated) {
      scheduleTokenRefresh();
    }
  }, [isAuthenticated, scheduleTokenRefresh]);
};