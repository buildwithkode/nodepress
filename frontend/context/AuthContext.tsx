'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Cookies from 'js-cookie';
import api from '../lib/axios';
import { encodeAccessCookie, type UserAccess } from '../lib/access';

interface User {
  id: number;
  email: string;
  /** Built-in role the user runs as (a custom role's base role). */
  role: string;
  /** Custom role name, when the user has one. */
  customRole?: string;
  /** What the role can use in the admin (from GET /auth/me). */
  access?: UserAccess;
}

/**
 * Role and module access in cookies so middleware can route before the page
 * loads. UX only — the backend enforces actual permissions.
 */
function rememberAccess(user: User) {
  Cookies.set('np_role', user.role, { expires: 30, sameSite: 'lax', path: '/' });
  if (user.access) Cookies.set('np_access', encodeAccessCookie(user.access) || '_', { expires: 30, sameSite: 'lax', path: '/' });
}

function forgetAccess() {
  Cookies.remove('np_role', { path: '/' });
  Cookies.remove('np_access', { path: '/' });
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

  // On mount: restore the session.
  // 1. If np_token cookie exists → validate it with /auth/me (interceptor silently refreshes on 401).
  // 2. If np_token is missing (browser expired it after 7 days) but np_refresh is still valid (30 days)
  //    → silently exchange the HttpOnly refresh cookie for a new access token, then load the user.
  //    This prevents forcing the user to manually re-login every 7 days.
  useEffect(() => {
    const token = Cookies.get('np_token');

    if (token) {
      api
        .get<User>('/auth/me')
        .then((res) => { rememberAccess(res.data); setUser(res.data); })
        .catch(() => {
          Cookies.remove('np_token');
          setUser(null);
        })
        .finally(() => setLoading(false));
      return;
    }

    // No access token — attempt a silent refresh. If np_refresh cookie is still
    // valid the backend issues a new access token and we restore the session
    // without any visible login prompt. If it fails (no cookie / expired), the
    // user simply stays unauthenticated and is shown the login page.
    api
      .post<{ access_token: string }>('/auth/refresh', {})
      .then((res) => {
        Cookies.set('np_token', res.data.access_token, { expires: 7, sameSite: 'lax', path: '/' });
        return api.get<User>('/auth/me');
      })
      .then((res) => { rememberAccess(res.data); setUser(res.data); })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = (token: string, newUser: User) => {
    // Store JWT in a cookie — readable by Next.js middleware for SSR route protection.
    // The user object lives only in React state, never in localStorage.
    Cookies.set('np_token', token, { expires: 7, sameSite: 'lax', path: '/' }); // 7 days — matches JWT expiry
    rememberAccess(newUser);
    setUser(newUser);
    // The login response has no module access — load it.
    api.get<User>('/auth/me').then((res) => { rememberAccess(res.data); setUser(res.data); }).catch(() => {});
  };

  const logout = () => {
    Cookies.remove('np_token', { path: '/' });
    forgetAccess();
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
