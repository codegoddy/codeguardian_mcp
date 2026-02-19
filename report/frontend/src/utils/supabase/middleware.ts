import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create an unmodified response first to check auth status without modifying cookies yet
  // actually, we need the client to potentially refresh cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  )

  // Check for backend access token cookie FIRST to avoid blocking network calls
  const backendToken = request.cookies.get('devhq_access_token');

  let user = null;
  // Only check Supabase auth if we don't have a backend token
  // This prevents blocking network calls on every request for authenticated users
  if (!backendToken) {
      const { data } = await supabase.auth.getUser();
      user = data.user;
  }

  // Debug logging to help diagnose login loop
  if (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/dashboard')) {
      console.log(`[Middleware] Path: ${request.nextUrl.pathname}`);
      console.log(`[Middleware] Has Supabase user: ${!!user}`);
      console.log(`[Middleware] Has backend token: ${!!backendToken?.value}`);
      if (backendToken) {
          console.log(`[Middleware] Backend token cookie found: ${backendToken.name}`);
      } else {
          console.log('[Middleware] No backend token cookie found');
      }
  }

  // Protect routes logic
  // If user is NOT signed in and the current path is NOT /login or /signup, redirect to /login
  if (
    !user &&
    !backendToken &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/signup') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/verify-otp') &&
    !request.nextUrl.pathname.startsWith('/api') && // Allow API routes (backend handles auth)
    !request.nextUrl.pathname.startsWith('/docs') &&
    !request.nextUrl.pathname.startsWith('/download') &&
    !request.nextUrl.pathname.startsWith('/waitlist') &&
    !request.nextUrl.pathname.startsWith('/pricing') &&
    !request.nextUrl.pathname.startsWith('/terms-of-service') &&
    !request.nextUrl.pathname.startsWith('/privacy-policy') &&
    !request.nextUrl.pathname.startsWith('/contact') &&
    !request.nextUrl.pathname.startsWith('/contracts/sign/') && // Public contract signing page
    !request.nextUrl.pathname.startsWith('/client-portal/') && // Public client portal
    !request.nextUrl.pathname.startsWith('/cli') && // CLI binaries and install scripts
    request.nextUrl.pathname !== '/' &&
    request.nextUrl.pathname !== '/manifest.json'
  ) {
    // Redirect to login
    /* 
       Note: You might want to allow public pages here.
       Adjust this logic based on your needs.
    */
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}
