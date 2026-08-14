import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== '/wallets') return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/portfolio';
  url.searchParams.set('view', 'wallets');
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ['/wallets']
};
