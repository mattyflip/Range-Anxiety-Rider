// Standard Edge Middleware for Vercel
// https://vercel.com/docs/functions/edge-middleware

// Note: This is an in-memory Map. On Vercel Edge, this state is per-isolate.
// It will not be perfectly global, but it provides basic DoS protection.
const rateLimitCache = new Map<string, { count: number; resetTime: number }>();

export default function middleware(request: Request) {
  const url = new URL(request.url);
  // Only apply to /api/ routes
  if (url.pathname.startsWith('/api/')) {
    // Basic IP tracking. 'x-forwarded-for' is set by Vercel.
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();
    
    let rateLimit = rateLimitCache.get(ip);
    
    // Clear expired limits to prevent memory leaks
    if (rateLimit && now > rateLimit.resetTime) {
      rateLimitCache.delete(ip);
      rateLimit = undefined;
    }

    if (rateLimit) {
      if (rateLimit.count >= 60) { // Limit to 60 API requests per minute per IP
        return new Response(
          JSON.stringify({ error: 'Too Many Requests', message: 'Rate limit exceeded.' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      }
      rateLimit.count += 1;
    } else {
      rateLimitCache.set(ip, { count: 1, resetTime: now + 60000 }); // 1 minute window
    }
  }

  // Continue to the intended destination
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}

export const config = {
  matcher: '/api/:path*',
};
