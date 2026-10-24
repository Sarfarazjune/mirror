import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { Database } from '../../types/database';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url && !key) {
    return supabaseResponse;
  }

  if (!url || !key) {
    throw new Error(
      'Set both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to enable authentication.'
    );
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError && authError.name !== 'AuthSessionMissingError') {
    throw authError;
  }

  const pathname = request.nextUrl.pathname;
  const protectedRoutes = [
    '/dashboard',
    '/onboarding',
    '/check-in',
    '/future-lab',
    '/weekly-review',
    '/settings',
  ];
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  const redirectWithUpdatedCookies = (destination: URL) => {
    const response = NextResponse.redirect(destination);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  };

  if (!user && isProtectedRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set(
      'next',
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return redirectWithUpdatedCookies(redirectUrl);
  }

  if (user && (pathname === '/login' || isProtectedRoute)) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile?.onboarding_completed && pathname !== '/onboarding') {
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = '/onboarding';
      onboardingUrl.search = '';
      return redirectWithUpdatedCookies(onboardingUrl);
    }

    if (profile?.onboarding_completed && pathname === '/onboarding') {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/dashboard';
      dashboardUrl.search = '';
      return redirectWithUpdatedCookies(dashboardUrl);
    }

    if (pathname === '/login') {
      const next = request.nextUrl.searchParams.get('next');
      let safeDestination = new URL('/dashboard', request.nextUrl.origin);
      if (
        next?.startsWith('/') &&
        !next.startsWith('//') &&
        !next.includes('\\')
      ) {
        try {
          const destination = new URL(next, request.nextUrl.origin);
          if (destination.origin === request.nextUrl.origin) {
            safeDestination = destination;
          }
        } catch {
          // Keep the user on the default in-app destination for malformed paths.
        }
      }
      return redirectWithUpdatedCookies(safeDestination);
    }
  }

  return supabaseResponse;
}
