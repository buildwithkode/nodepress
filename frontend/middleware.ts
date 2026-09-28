import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that require any authenticated user
const ADMIN_PATHS = ['/', '/content-types', '/entries', '/media', '/api-keys', '/forms', '/users', '/webhooks', '/audit-log', '/brand'];

// Paths that require editor, contributor, or admin role (viewers are redirected to home)
const EDITOR_PATHS = [
  '/entries/new',
  '/forms/new',
];
const EDITOR_PATTERNS = [
  /^\/entries\/[^/]+\/edit$/,
  /^\/forms\/[^/]+\/edit$/,
];

// Paths that require admin role only (editors and viewers are redirected to home)
const ADMIN_ONLY_PATHS = [
  '/users',
  '/api-keys',
  '/webhooks',
  '/audit-log',
  '/brand',
  '/content-types/new',
];
const ADMIN_ONLY_PATTERNS = [
  /^\/content-types\/[^/]+\/edit$/,
];

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

function isEditorPath(pathname: string): boolean {
  return (
    EDITOR_PATHS.includes(pathname) ||
    EDITOR_PATTERNS.some((r) => r.test(pathname))
  );
}

function isAdminOnlyPath(pathname: string): boolean {
  return (
    ADMIN_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    ADMIN_ONLY_PATTERNS.some((r) => r.test(pathname))
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

  // Role-based route protection (UX only — backend enforces real permissions)
  if (token && role) {
    if (isAdminOnlyPath(pathname) && role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    if (isEditorPath(pathname) && (role === 'viewer' || !role)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Exclude Next.js internals, static files, and API proxy paths
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|uploads).*)'],
};
