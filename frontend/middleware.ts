import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Only these paths require authentication
const ADMIN_PATHS = ['/', '/content-types', '/entries', '/media', '/api-keys'];

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('np_token')?.value;
  const { pathname } = request.nextUrl;

  const isLoginPage = pathname === '/login';

  // Protect admin paths — redirect to login if no token
  if (!token && isAdminPath(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Already logged in — redirect away from login page
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Exclude Next.js internals, static files, and API proxy paths
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|uploads).*)'],
};
