import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeAccessCookie, levelAllows, levelForPath, moduleForPath, ADMIN_ONLY } from './lib/access';

// Paths that require any authenticated user
const ADMIN_PATHS = ['/', '/content-types', '/components', '/entries', '/media', '/api-keys', '/forms', '/users', '/webhooks', '/jobs', '/audit-log', '/brand', '/plugins', '/languages', '/releases', '/server-settings', '/import', '/redirects', '/choice-lists'];

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

function isTokenValid(token?: string): boolean {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload = JSON.parse(json);
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return false; // Token expired
    }
    return true;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const rawToken    = request.cookies.get('np_token')?.value;
  const tokenValid  = isTokenValid(rawToken);
  const token       = tokenValid ? rawToken : undefined;
  const role        = request.cookies.get('np_role')?.value;
  const initialized = request.cookies.get('np_initialized')?.value;
  const { pathname } = request.nextUrl;

  const isLoginPage = pathname === '/login';
  const isSetupPage = pathname === '/setup';

  // If a stale or expired token is present on an admin path, clear it and redirect to login
  if (!token && rawToken && isAdminPath(pathname)) {
    const res = NextResponse.redirect(new URL('/login?reason=expired', request.url));
    res.cookies.delete('np_token');
    res.cookies.delete('np_role');
    res.cookies.delete('np_access');
    return res;
  }

  // Protect admin paths when unauthenticated
  if (!token && isAdminPath(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Already logged in with a valid token — redirect away from login/setup pages
  if (token && (isLoginPage || isSetupPage)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // np_initialized present but no token — setup is done, just need to log in
  if (!token && isSetupPage && initialized) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Module access (UX only — backend enforces real permissions). np_access is
  // written from GET /auth/me; without it the page loads and the API decides.
  const accessCookie = request.cookies.get('np_access')?.value;
  if (token && role && role !== 'admin' && isAdminPath(pathname)) {
    const module = moduleForPath(pathname);
    if (module === ADMIN_ONLY) return NextResponse.redirect(new URL('/', request.url));
    if (module && accessCookie !== undefined) {
      const level = decodeAccessCookie(accessCookie)[module];
      if (!levelAllows(level, levelForPath(pathname))) return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Exclude Next.js internals, static files, and API proxy paths
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|uploads).*)'],
};
