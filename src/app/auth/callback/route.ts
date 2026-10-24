import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

function getSafeNextPath(next: string | null, origin: string) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return '/dashboard';
  }

  try {
    const destination = new URL(next, origin);
    return destination.origin === origin
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : '/dashboard';
  } catch {
    return '/dashboard';
  }
}

function redirectToLogin(request: Request, error: string, description?: string) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('error', error);
  if (description) {
    loginUrl.searchParams.set('error_description', description.slice(0, 300));
  }
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const callbackUrl = new URL(request.url);
  const code = callbackUrl.searchParams.get('code');
  const providerError =
    callbackUrl.searchParams.get('error_description') ??
    callbackUrl.searchParams.get('error');

  if (providerError) {
    return redirectToLogin(request, 'oauth_provider_error', providerError);
  }

  if (!code) {
    return redirectToLogin(request, 'oauth_missing_code');
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return redirectToLogin(
      request,
      'oauth_exchange_failed',
      exchangeError.message
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return redirectToLogin(
      request,
      'oauth_user_unavailable',
      userError?.message
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.onboarding_completed) {
    const onboardingUrl = new URL('/onboarding', callbackUrl.origin);
    if (profileError) {
      onboardingUrl.searchParams.set('error', 'profile_status_unavailable');
    }
    return NextResponse.redirect(onboardingUrl);
  }

  const next = getSafeNextPath(
    callbackUrl.searchParams.get('next'),
    callbackUrl.origin
  );
  return NextResponse.redirect(new URL(next, callbackUrl.origin));
}
