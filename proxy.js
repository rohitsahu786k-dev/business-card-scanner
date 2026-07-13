import { NextResponse } from 'next/server';

export function proxy(req) {
  try {
    const { pathname } = req.nextUrl;

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

    const sessionToken = req.cookies.get('next-auth.session-token')?.value;
    const secureSessionToken = req.cookies.get('__Secure-next-auth.session-token')?.value;

    if (!sessionToken && !secureSessionToken) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Proxy error:', error);
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
