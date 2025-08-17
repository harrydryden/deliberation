
import { User } from './api';

export { User };

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  authenticate: (accessCode: string) => Promise<void>;
  authenticateWithAccessCode: (accessCode: string, codeType?: string) => Promise<void>;
  signOut: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  refreshToken: () => Promise<void>;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

export interface TokenPayload {
  sub: string;
  accessCode: string;
  exp: number;
  iat: number;
}
