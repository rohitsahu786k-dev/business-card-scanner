import { NextResponse } from 'next/server';

export async function middleware(req) {
  try {
    const { pathname } = req.nextUrl;

    // Allow API auth, public assets, login/signup/forgot-password/reset-password pages
    if (
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/api/signup') ||
      pathname.startsWith('/api/forgot-password') ||
      pathname.startsWith('/api/reset-password') ||
      pathname.startsWith('/assets') ||
      pathname === '/favicon.ico' ||
      pathname === '/login' ||
      pathname === '/signup' ||
      pathname === '/forgot-password' ||
      pathname === '/reset-password'
    ) {
      return NextResponse.next();
    }

    // Edge-safe check for NextAuth session cookies
    const sessionToken = req.cookies.get('next-auth.session-token')?.value;
    const secureSessionToken = req.cookies.get('__Secure-next-auth.session-token')?.value;

    // Redirect unauthenticated users to login if no session cookie exists
    if (!sessionToken && !secureSessionToken) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Middleware error:', error);
    // Graceful fallback to login page to avoid 500 Edge Function crash
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
