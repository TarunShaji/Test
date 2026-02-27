import { NextResponse } from 'next/server';

export function middleware(request) {
    const { pathname } = request.nextUrl;

    // Only log API calls
    if (pathname.startsWith('/api')) {
        const method = request.method;
        const start = Date.now();

        // We can't easily log the response status in Next.js middleware 
        // without some complex workarounds, but we can log the initiation.
        console.log(`[BACKEND] [API_REQ] [${method}] ${pathname} - Started at ${new Date().toISOString()}`);

        const response = NextResponse.next();

        // Add a custom header to track request duration if needed
        response.headers.set('X-Request-Start', start.toString());

        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: '/api/:path*',
};
