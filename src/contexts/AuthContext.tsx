// src/contexts/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { apiService } from '../services/api';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'student' | 'teacher' | 'admin';
  avatar?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'student' | 'teacher';
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (userData: RegisterData) => Promise<boolean>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(u: any): User | null {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName ?? u.first_name ?? null,
    lastName: u.lastName ?? u.last_name ?? null,
    role: u.role,
    avatar: u.avatar ?? null,
  } as User;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        apiService.setToken(token);
        try {
          const me = await apiService.getCurrentUser();
          // /auth/me => {user} OU user direct
          const normalized = normalizeUser((me && me.user) ? me.user : me);
          setUser(normalized);
        } catch (error) {
          console.warn('Auth initialization failed:', error);
          apiService.clearToken();
          setUser(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await apiService.login(email, password);
      if (res?.token) apiService.setToken(res.token);
      const me = res?.user ?? (await apiService.getCurrentUser().catch(() => null));
      setUser(normalizeUser(me));
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      apiService.clearToken();
      setUser(null);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData: RegisterData): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await apiService.register(userData);
      if (res?.token) apiService.setToken(res.token);
      const me = res?.user ?? (await apiService.getCurrentUser().catch(() => null));
      setUser(normalizeUser(me));
      return true;
    } catch (error) {
      console.error('Registration failed:', error);
      apiService.clearToken();
      setUser(null);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try { await apiService.logout(); } catch {}
    apiService.clearToken();
    setUser(null);
  };

  const resetPassword = async (email: string): Promise<boolean> => {
    setLoading(true);
    try {
      await apiService.resetPassword(email);
      return true;
    } catch (error) {
      console.error('Password reset failed:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
