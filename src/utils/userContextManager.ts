/**
 * User Context Manager - Minimal implementation
 */

export const userContextManager = {
  setUserContext: (userId: string, context: any) => {
    // No-op for now
  },
  getUserContext: (userId: string) => {
    return null;
  },
  clearUserContext: (userId: string) => {
    // No-op for now
  },
  validateMessageCreation: (userId: string, message: any) => {
    return true;
  },
  clearUserCache: (userId: string) => {
    // No-op for now
  }
};