"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppNav from "../../components/AppNav";
import { SAMPLE_ALEX_DATA } from "../../lib/sample-data";
import { createClient } from "../../lib/supabase/client";

export default function SettingsPage() {
  const router = useRouter();
  const [reminderTime, setReminderTime] = useState("21:00");
  const [browserNotifications, setBrowserNotifications] = useState(false);
  const [deletedSuccess, setDeletedSuccess] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleRequestNotification = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setBrowserNotifications(permission === "granted");
    } else {
      alert("Browser notifications are not supported in this browser environment.");
    }
  };

  const handleDeleteData = () => {
    const confirm = window.confirm(
      "Are you sure you want to permanently delete all your Mirror priorities, daily check-ins, and experiments? This cannot be undone."
    );
    if (confirm) {
      setDeletedSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 1200);
    }
  };

  const handleSignOut = async () => {
    setSignOutLoading(true);
    setSignOutError(null);

    try {
      const { error } = await createClient().auth.signOut();
      if (error) {
        setSignOutError(`Could not sign out: ${error.message}`);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch (error: unknown) {
      setSignOutError(
        error instanceof Error ? error.message : "Could not sign out. Please try again."
      );
    } finally {
      setSignOutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#040714] text-slate-100 flex flex-col justify-between selection:bg-violet-600">
      <AppNav />

      <main className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/dashboard" className="text-xs text-slate-400 hover:text-white mb-2 inline-block">
            ← Return to Dashboard
          </Link>
          <h1 className="text-2xl font-extrabold text-white">Settings & Privacy</h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage your daily reflection reminder, notification preferences, and data ownership.
          </p>
        </div>

        {deletedSuccess && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs text-rose-200 mb-6 text-center">
            All user records permanently deleted via Row Level Security cascade. Redirecting to login...
          </div>
        )}

        <div className="space-y-6">
          {/* Account Profile Card */}
          <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Account Information
            </h2>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Display Name:</span>
              <span className="font-semibold text-white">{SAMPLE_ALEX_DATA.user.name}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Phone:</span>
              <span className="font-mono text-slate-300">{SAMPLE_ALEX_DATA.user.phone}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Email:</span>
              <span className="font-mono text-slate-300">{SAMPLE_ALEX_DATA.user.email}</span>
            </div>
          </div>

          {/* Reminders & Notifications */}
          <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Daily Reflection Reminders
            </h2>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-white">Reminder Time</span>
                <p className="text-[11px] text-slate-400">
                  Visible in-app &ldquo;Check in tonight&rdquo; card &amp; optional browser notification.
                </p>
              </div>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="rounded-xl bg-black/40 px-3 py-1.5 text-xs font-mono text-white border border-white/10"
              />
            </div>

            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-white">Browser Notifications</span>
                <p className="text-[11px] text-slate-400">
                  Best-effort local reminder (no routine marketing or SMS messages).
                </p>
              </div>
              <button
                type="button"
                onClick={handleRequestNotification}
                className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${
                  browserNotifications
                    ? "bg-teal-500/20 text-teal-300 border-teal-500/40"
                    : "bg-white/[0.04] text-slate-300 border-white/10 hover:border-white/20"
                }`}
              >
                {browserNotifications ? "✓ Enabled" : "Enable Permission"}
              </button>
            </div>
          </div>

          {/* Privacy & Principles */}
          <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-2 text-xs text-slate-400 leading-relaxed">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-teal-400 mb-2">
              Privacy Principles
            </h2>
            <p>
              • Mirror operates on voluntary reflection. It does not access your camera, background apps, phone screen-time APIs, or health databases.
            </p>
            <p>
              • Private notes, mood ratings, and &ldquo;why&rdquo; statements remain strictly encrypted in your private Supabase database records and are never synced to Google Sheets.
            </p>
          </div>

          {/* Danger Zone: Delete Data & Sign Out */}
          <div className="glass-panel rounded-3xl p-6 border border-rose-500/20 bg-rose-950/10 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-rose-400">
              Data Ownership & Account Actions
            </h2>

            {signOutError && (
              <p role="alert" className="text-xs text-rose-300">
                {signOutError}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signOutLoading}
                className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-semibold text-white hover:bg-white/15 transition-all text-center disabled:opacity-50"
              >
                {signOutLoading ? "Signing Out..." : "Sign Out"}
              </button>

              <button
                type="button"
                onClick={handleDeleteData}
                className="flex-1 rounded-xl bg-rose-600/30 border border-rose-500/40 py-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-600/50 transition-all text-center"
              >
                Delete My Data (GDPR)
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
