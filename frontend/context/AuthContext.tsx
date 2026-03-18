'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import Cookies from 'js-cookie';

interface User {
  id: number;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>(null!);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('np_user');
    return stored ? JSON.parse(stored) : null;
  });

  const login = (token: string, newUser: User) => {
    // Store token in cookie (readable by middleware)
    Cookies.set('np_token', token, { expires: 7, sameSite: 'strict' });
    localStorage.setItem('np_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const logout = () => {
    Cookies.remove('np_token');
    localStorage.removeItem('np_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, login, logout, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
