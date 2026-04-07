import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that require any authenticated user
const ADMIN_PATHS = ['/', '/content-types', '/entries', '/media', '/api-keys', '/forms', '/users', '/webhooks', '/audit-log'];

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

export function middleware(request: NextRequest) {
  const token = request.cookies.get('np_token')?.value;
  const role  = request.cookies.get('np_role')?.value;
  const { pathname } = request.nextUrl;

  const isLoginPage = pathname === '/login';
  const isSetupPage = pathname === '/setup';

  // Protect admin paths — redirect to login if no token
  if (!token && isAdminPath(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Already logged in — redirect away from login/setup pages
  if (token && (isLoginPage || isSetupPage)) {
    return NextResponse.redirect(new URL('/', request.url));
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
