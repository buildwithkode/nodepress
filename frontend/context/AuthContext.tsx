'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Cookies from 'js-cookie';
import api from '../lib/axios';

interface User {
  id: number;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>(null!);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: if a valid access token cookie exists, fetch the canonical user
  // from the server instead of trusting localStorage (which is XSS-readable).
  useEffect(() => {
    const token = Cookies.get('np_token');
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get<User>('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        // Token is invalid or expired and refresh failed — clear auth state.
        // The axios interceptor already handles the redirect to /login on 401.
        Cookies.remove('np_token');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = (token: string, newUser: User) => {
    // Store JWT in a cookie — readable by Next.js middleware for SSR route protection.
    // The user object lives only in React state, never in localStorage.
    Cookies.set('np_token', token, { expires: 7, sameSite: 'strict' });
    // Store role in a separate cookie so middleware can enforce role-based routing.
    // This cookie is for UX only — the backend enforces actual permissions.
    Cookies.set('np_role', newUser.role, { expires: 7, sameSite: 'strict' });
    setUser(newUser);
  };

  const logout = () => {
    Cookies.remove('np_token');
    Cookies.remove('np_role');
    setUser(null);
    // Ask the backend to clear the HttpOnly refresh cookie
    api.post('/auth/logout').catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
