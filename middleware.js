import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

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

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    // Redirect unauthenticated users to login
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    // Admin authorization check
    if (pathname.startsWith('/api/admin') || pathname.startsWith('/admin')) {
      if (token.role !== 'admin') {
        const url = req.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
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
