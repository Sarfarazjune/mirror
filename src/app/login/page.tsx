"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

function getSafeNextPath(path: string | null) {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/dashboard";
  }

  try {
    const destination = new URL(path, window.location.origin);
    return destination.origin === window.location.origin
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [authMethod, setAuthMethod] = useState<"phone" | "google">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resendCountdown === 0) return;
    const timeout = window.setTimeout(
      () => setResendCountdown((seconds) => Math.max(0, seconds - 1)),
      1000
    );
    return () => window.clearTimeout(timeout);
  }, [resendCountdown]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (!error) return;

    const description = params.get("error_description");
    const timeout = window.setTimeout(() => {
      setErrorMessage(
        description
          ? `Google sign-in could not be completed: ${description}`
          : "Google sign-in could not be completed. Check your Supabase Google provider settings and try again."
      );
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const requestOtp = async (phoneInput: string, isResend = false) => {
    setErrorMessage(null);
    setInfoMessage(null);

    const cleanPhone = phoneInput.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(cleanPhone)) {
      setErrorMessage("Please enter a valid phone number in E.164 international format (e.g. +15550192834).");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        phone: cleanPhone,
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setInfoMessage(
          isResend
            ? `A new verification code was sent to ${cleanPhone}.`
            : `Six-digit verification code sent to ${cleanPhone}.`
        );
        setOtpSent(true);
        setOtpCode("");
        setResendCountdown(30);
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not send the verification code. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestOtp(phoneNumber);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanOtp = otpCode.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setErrorMessage("Please enter the full 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.verifyOtp({
        phone: phoneNumber.trim(),
        token: cleanOtp,
        type: "sms",
      });

      if (error) {
        setErrorMessage(error.message);
      } else if (!data.session || !data.user) {
        setErrorMessage("The code was not accepted as a signed-in session. Request a new code and try again.");
      } else {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profileError) {
          setErrorMessage(`Your phone was verified, but Mirror could not check your onboarding status: ${profileError.message}`);
          return;
        }

        const nextPath = getSafeNextPath(
          new URLSearchParams(window.location.search).get("next")
        );
        router.replace(
          profile?.onboarding_completed ? nextPath : "/onboarding"
        );
        router.refresh();
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not verify the code. Request a new code and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth via Supabase
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: (() => {
            const callbackUrl = new URL("/auth/callback", origin);
            const nextPath = getSafeNextPath(
              new URLSearchParams(window.location.search).get("next")
            );
            if (nextPath !== "/dashboard") {
              callbackUrl.searchParams.set("next", nextPath);
            }
            return callbackUrl.toString();
          })(),
        },
      });

      if (error) {
        setErrorMessage(`Google sign-in could not be started: ${error.message}`);
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not start Google sign-in. Check your Supabase provider settings and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-center items-center bg-[#040714] p-6 text-slate-100 selection:bg-violet-600">
      {/* Background glow */}
      <div className="pointer-events-none absolute h-[500px] w-[500px] rounded-full bg-violet-950/20 blur-[140px]" />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20 border border-white/10 group-hover:border-violet-400/40">
              <div className="h-3.5 w-3.5 rounded-full bg-gradient-to-tr from-violet-400 to-teal-300 shadow-[0_0_10px_rgba(139,92,246,0.8)]" />
            </div>
            <span className="font-semibold tracking-wider text-xl text-white">Mirror</span>
          </Link>
          <h2 className="text-2xl font-bold tracking-tight text-white mt-4">
            Reflect honestly.
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Sign in to access your private life-alignment workspace.
          </p>
        </div>

        {/* Glass Card */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl">
          {/* Method selector tab */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/60 p-1 mb-6 border border-white/5">
            <button
              type="button"
              onClick={() => {
                setAuthMethod("phone");
                setErrorMessage(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                authMethod === "phone"
                  ? "bg-violet-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Phone SMS OTP
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod("google");
                setErrorMessage(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                authMethod === "google"
                  ? "bg-violet-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Google Account
            </button>
          </div>

          {/* Feedback messages */}
          {errorMessage && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300 mb-4 leading-relaxed">
              {errorMessage}
            </div>
          )}
          {infoMessage && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3 text-xs text-cyan-200 mb-4 leading-relaxed">
              {infoMessage}
            </div>
          )}

          {/* Phone SMS OTP Flow */}
          {authMethod === "phone" && (
            <>
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label htmlFor="phone-input" className="block text-xs font-medium text-slate-300 mb-2">
                      Phone Number (E.164 Format)
                    </label>
                    <input
                      id="phone-input"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+15550192834"
                      autoComplete="tel"
                      pattern="\\+[1-9][0-9]{7,14}"
                      title="Enter a phone number in international E.164 format."
                      className="w-full rounded-xl bg-white/[0.04] p-3 text-sm text-white placeholder-slate-500 border border-white/10 focus:border-violet-400 focus:outline-none"
                      required
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Include country code with leading + (e.g. +1 for US/CA, +44 for UK).
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 hover:from-violet-500 hover:to-indigo-500 transition-all disabled:opacity-50"
                  >
                    {loading ? "Sending SMS..." : "Send Verification Code"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label htmlFor="otp-input" className="block text-xs font-medium text-slate-300 mb-2">
                      Enter 6-Digit Code
                    </label>
                    <input
                      id="otp-input"
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      placeholder="------"
                      className="w-full text-center tracking-[0.5em] text-lg font-mono rounded-xl bg-white/[0.04] p-3 text-white border border-white/10 focus:border-violet-400 focus:outline-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-teal-600 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 hover:from-violet-500 hover:to-teal-500 transition-all disabled:opacity-50"
                  >
                    {loading ? "Verifying..." : "Verify & Enter Mirror"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void requestOtp(phoneNumber, true)}
                    disabled={loading || resendCountdown > 0}
                    className="w-full text-center text-xs text-violet-300 hover:text-violet-200 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {loading
                      ? "Please wait..."
                      : resendCountdown > 0
                        ? `Resend code in ${resendCountdown}s`
                        : "Resend verification code"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode("");
                      setResendCountdown(0);
                      setErrorMessage(null);
                      setInfoMessage(null);
                    }}
                    className="w-full text-center text-xs text-slate-400 hover:text-white"
                  >
                    ← Edit phone number
                  </button>
                </form>
              )}
            </>
          )}

          {/* Google Sign-in Flow */}
          {authMethod === "google" && (
            <div className="space-y-4 text-center">
              <p className="text-xs text-slate-400 mb-2">
                Authenticate securely through Supabase OAuth with Google.
              </p>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.05] py-3.5 text-sm font-semibold text-white hover:bg-white/[0.1] hover:border-white/30 transition-all shadow-md"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="pt-2">
                <Link
                  href="/onboarding"
                  className="text-xs text-violet-300 hover:text-violet-200"
                >
                  Skip to Onboarding preview →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Demo Mode Quick Access */}
        <div className="text-center mt-6">
          <Link
            href="/dashboard"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Or browse Dashboard directly in Sample Week mode →
          </Link>
        </div>
      </div>
    </div>
  );
}
