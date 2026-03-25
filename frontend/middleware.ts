import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sessionId = request.cookies.get('session_id')?.value

  // Allow API routes to pass through to the rewrite proxy (no redirect)
  if (pathname.startsWith('/merchant/auth')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/merchant') && !sessionId) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname === '/login' && sessionId) {
    const dashboardUrl = new URL('/merchant/dashboard', request.url)
    return NextResponse.redirect(dashboardUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/login', '/merchant/:path*'],
}
