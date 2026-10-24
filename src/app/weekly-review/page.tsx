"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppNav from "../../components/AppNav";
import { calculateMirrorScore, generateWeeklyLetter } from "../../lib/mirror-engine";
import { createClient } from "../../lib/supabase/client";

interface ReviewPriority {
  id: string;
  name: string;
  why_statement: string;
  colour: string;
  weekly_target_minutes: number;
  actual_minutes: number;
}

interface WeeklyMetrics {
  weekStart: string;          // YYYY-MM-DD (Monday)
  weekLabel: string;          // Human-readable "October 19–25, 2026"
  alignmentScore: number;
  targetCompletionPercent: number;
  avgSleepMinutes: number;
  totalWastedMinutes: number;
  checkinCount: number;
  priorities: ReviewPriority[];
  experimentOutcome: string | null;
  weeklyLetter: string;
}

function getWeekStart(offsetWeeks = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetWeeks * 7);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function formatWeekLabel(mondayStr: string): string {
  const start = new Date(mondayStr + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
  const startFmt = start.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const endFmt = end.toLocaleDateString("en-US", opts);
  return `${startFmt}–${endFmt}`;
}

function fmtSleep(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export default function WeeklyReviewPage() {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<WeeklyMetrics | null>(null);

  const [isSavingReport, setIsSavingReport] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message?: string;
    demoMode?: boolean;
    previewRow?: Record<string, string | number>;
  } | null>(null);

  // "Last week" offset — 0 = current week, 1 = last week
  const [weekOffset, setWeekOffset] = useState(1);

  const loadWeeklyData = useCallback(async (offset: number) => {
    setLoading(true);
    setErrorMessage(null);
    setReportSaved(false);
    setSyncResult(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      setIsAuthenticated(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const weekStart = getWeekStart(offset);
      const weekEnd = (() => {
        const d = new Date(weekStart + "T12:00:00");
        d.setDate(d.getDate() + 6);
        return d.toISOString().split("T")[0];
      })();

      // 1. Fetch priorities
      const { data: rawPriorities, error: priErr } = await db
        .from("priorities")
        .select("id, name, colour, why_statement, weekly_target_minutes, sort_order")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (priErr) {
        setErrorMessage(`Could not load priorities: ${priErr.message}`);
        setLoading(false);
        return;
      }

      const priorities: ReviewPriority[] = (rawPriorities || []).map(
        (p: { id: string; name: string; why_statement: string; colour: string; weekly_target_minutes: number }) => ({
          id: p.id,
          name: p.name,
          why_statement: p.why_statement,
          colour: p.colour,
          weekly_target_minutes: p.weekly_target_minutes,
          actual_minutes: 0,
        })
      );

      // 2. Fetch daily check-ins for the week
      const { data: checkins, error: checkinErr } = await db
        .from("daily_checkins")
        .select("id, checkin_date, wasted_minutes, sleep_minutes")
        .eq("user_id", user.id)
        .gte("checkin_date", weekStart)
        .lte("checkin_date", weekEnd);

      if (checkinErr) {
        setErrorMessage(`Could not load check-ins: ${checkinErr.message}`);
        setLoading(false);
        return;
      }

      const checkinList = checkins || [];
      const checkinIds = checkinList.map((c: { id: string }) => c.id);
      const totalWastedMinutes = checkinList.reduce(
        (sum: number, c: { wasted_minutes: number | null }) => sum + (c.wasted_minutes || 0),
        0
      );
      const sleepEntries = checkinList.filter((c: { sleep_minutes: number | null }) => c.sleep_minutes != null);
      const avgSleepMinutes =
        sleepEntries.length > 0
          ? Math.round(
              sleepEntries.reduce((sum: number, c: { sleep_minutes: number }) => sum + c.sleep_minutes, 0) /
                sleepEntries.length
            )
          : 0;

      // 3. Fetch time entries and aggregate per priority
      if (checkinIds.length > 0) {
        const { data: timeEntries, error: teErr } = await db
          .from("time_entries")
          .select("priority_id, minutes")
          .eq("user_id", user.id)
          .in("checkin_id", checkinIds);

        if (!teErr && timeEntries) {
          const minutesMap: Record<string, number> = {};
          timeEntries.forEach((e: { priority_id: string; minutes: number }) => {
            minutesMap[e.priority_id] = (minutesMap[e.priority_id] || 0) + (e.minutes || 0);
          });
          priorities.forEach((p) => {
            p.actual_minutes = minutesMap[p.id] || 0;
          });
        }
      }

      // 4. Calculate Mirror score from actual data
      const scoreResult = calculateMirrorScore(
        priorities.map((p) => ({
          name: p.name,
          targetMinutes: p.weekly_target_minutes,
          actualMinutes: p.actual_minutes,
          colour: p.colour,
        })),
        totalWastedMinutes
      );

      // 5. Fetch completed/cancelled experiments that overlapped with this week
      const { data: expData } = await db
        .from("experiments")
        .select("id, target_priority_id, transfer_minutes_per_day, starts_on, ends_on, status")
        .eq("user_id", user.id)
        .in("status", ["completed", "abandoned", "active"])
        .gte("ends_on", weekStart)
        .lte("starts_on", weekEnd)
        .limit(1)
        .maybeSingle();

      let experimentOutcome: string | null = null;
      if (expData) {
        const targetPriority = priorities.find((p) => p.id === expData.target_priority_id);
        const priorityName = targetPriority?.name || "target priority";
        if (expData.status === "active") {
          const startMs = new Date(expData.starts_on).getTime();
          const weekEndMs = new Date(weekEnd + "T23:59:59").getTime();
          const daysDone = Math.min(7, Math.max(0, Math.floor((weekEndMs - startMs) / 86400000) + 1));
          experimentOutcome = `${daysDone} of 7 days toward +${expData.transfer_minutes_per_day}m/day on ${priorityName}`;
        } else if (expData.status === "completed") {
          experimentOutcome = `Completed all 7 days of +${expData.transfer_minutes_per_day}m/day to ${priorityName}`;
        } else {
          experimentOutcome = `Experiment on ${priorityName} was abandoned before completion`;
        }
      }

      // 6. Rule-based letter from actual data
      const weeklyLetter = generateWeeklyLetter({
        priorities: priorities.map((p) => ({
          name: p.name,
          why: p.why_statement,
          targetMinutes: p.weekly_target_minutes,
          actualMinutes: p.actual_minutes,
        })),
        score: scoreResult.score,
        experimentOutcome,
      });

      setMetrics({
        weekStart,
        weekLabel: formatWeekLabel(weekStart),
        alignmentScore: scoreResult.score,
        targetCompletionPercent: scoreResult.targetCompletionPercent,
        avgSleepMinutes,
        totalWastedMinutes,
        checkinCount: checkinList.length,
        priorities,
        experimentOutcome,
        weeklyLetter,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load weekly review data.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      await loadWeeklyData(weekOffset);
    };
    if (!ignore) {
      run();
    }
    return () => {
      ignore = true;
    };
  }, [loadWeeklyData, weekOffset]);

  const handleSaveReport = async () => {
    if (!metrics) return;
    setIsSavingReport(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setErrorMessage("Session expired. Please sign in.");
        setIsSavingReport(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const { error: upsertErr } = await db
        .from("weekly_reports")
        .upsert(
          {
            user_id: user.id,
            week_start: metrics.weekStart,
            alignment_score: metrics.alignmentScore,
            target_completion_percent: metrics.targetCompletionPercent,
            letter: metrics.weeklyLetter,
          },
          { onConflict: "user_id,week_start" }
        );

      if (upsertErr) {
        setErrorMessage(`Failed to save weekly report: ${upsertErr.message}`);
        setIsSavingReport(false);
        return;
      }

      setReportSaved(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error saving report.";
      setErrorMessage(msg);
    } finally {
      setIsSavingReport(false);
    }
  };

  const handleSyncToGoogleSheets = async () => {
    if (!metrics) return;
    setIsSyncing(true);
    setSyncResult(null);

    // Aggregate a few helper columns for the sheet
    const totalStudy = metrics.priorities
      .filter((p) => /study|computer|science|learn/i.test(p.name))
      .reduce((s, p) => s + p.actual_minutes, 0);
    const totalFitness = metrics.priorities
      .filter((p) => /fitness|health|strength|gym|exercise/i.test(p.name))
      .reduce((s, p) => s + p.actual_minutes, 0);
    const totalPassion = metrics.priorities
      .filter((p) => !/study|computer|science|learn|fitness|health|strength|gym|exercise/i.test(p.name))
      .reduce((s, p) => s + p.actual_minutes, 0);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      let displayName = "Reflector";
      if (user) {
        const { data: profile } = await db
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();
        displayName = profile?.display_name || user.user_metadata?.full_name || displayName;
      }

      const res = await fetch("/api/reports/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: metrics.weekStart,
          userDisplayName: displayName,
          alignmentScore: metrics.alignmentScore,
          targetCompletionPercent: metrics.targetCompletionPercent,
          studyMinutes: totalStudy,
          fitnessMinutes: totalFitness,
          passionMinutes: totalPassion,
          averageSleepMinutes: metrics.avgSleepMinutes,
          experimentOutcome: metrics.experimentOutcome || "No active experiment this week",
        }),
      });

      const data = await res.json();

      // If sync succeeded, also update sheet_synced_at in weekly_reports
      if (data.success && user && metrics) {
        await db
          .from("weekly_reports")
          .update({ sheet_synced_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("week_start", metrics.weekStart);
      }

      setSyncResult(data);
    } catch (err: unknown) {
      setSyncResult({
        success: false,
        message: err instanceof Error ? err.message : "Sync request failed",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#040714] text-slate-100 flex flex-col justify-between selection:bg-violet-600">
      <AppNav />

      <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/dashboard" className="text-xs text-slate-400 hover:text-white mb-2 inline-block">
            ← Return to Dashboard
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                Weekly Reflection & Sheets Sync
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                {metrics ? `Week of ${metrics.weekLabel} · ${metrics.checkinCount} day${metrics.checkinCount !== 1 ? "s" : ""} observed.` : "Loading week data…"}
              </p>
            </div>
            {/* Week switcher */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekOffset(1)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  weekOffset === 1
                    ? "bg-violet-600/20 border-violet-400 text-violet-200"
                    : "bg-white/[0.03] border-white/10 text-slate-400 hover:border-white/20"
                }`}
              >
                Last week
              </button>
              <button
                onClick={() => setWeekOffset(0)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  weekOffset === 0
                    ? "bg-violet-600/20 border-violet-400 text-violet-200"
                    : "bg-white/[0.03] border-white/10 text-slate-400 hover:border-white/20"
                }`}
              >
                This week
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-4 text-xs text-rose-300 mb-6">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="glass-panel rounded-3xl p-10 border border-white/10 text-center mb-8">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent mb-3" />
            <p className="text-xs text-slate-400">Loading your week&rsquo;s data…</p>
          </div>
        )}

        {/* Unauthenticated */}
        {!loading && !isAuthenticated && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-6 mb-8 text-center">
            <p className="text-sm font-medium text-amber-200 mb-4">
              Sign in to generate and save your weekly reflection.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-violet-500 transition-all"
            >
              Sign In to Continue
            </Link>
          </div>
        )}

        {/* No priorities */}
        {!loading && isAuthenticated && metrics?.priorities.length === 0 && (
          <div className="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-6 mb-8 text-center">
            <p className="text-sm font-medium text-violet-200 mb-3">
              No active priorities found for this week.
            </p>
            <Link href="/onboarding" className="inline-block rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-violet-500 transition-all">
              Complete Onboarding Setup →
            </Link>
          </div>
        )}

        {!loading && isAuthenticated && metrics && metrics.priorities.length > 0 && (
          <>
            {/* No check-ins notice */}
            {metrics.checkinCount === 0 && (
              <div className="rounded-2xl border border-slate-700/40 bg-slate-900/30 p-4 text-xs text-slate-400 mb-6">
                No check-ins recorded for this week yet. Complete a daily check-in to see real metrics.
              </div>
            )}

            {/* 4 Summary Metric Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="glass-panel rounded-2xl p-4 border border-white/10">
                <span className="text-[11px] font-mono uppercase text-violet-400">Weekly Score</span>
                <div className="text-2xl font-extrabold text-white mt-1">{metrics.alignmentScore}%</div>
                <p className="text-[10px] text-slate-500 mt-0.5">Aligned intention</p>
              </div>

              <div className="glass-panel rounded-2xl p-4 border border-white/10">
                <span className="text-[11px] font-mono uppercase text-teal-400">Target Reached</span>
                <div className="text-2xl font-extrabold text-white mt-1">{metrics.targetCompletionPercent}%</div>
                <p className="text-[10px] text-slate-500 mt-0.5">Total minutes done</p>
              </div>

              <div className="glass-panel rounded-2xl p-4 border border-white/10">
                <span className="text-[11px] font-mono uppercase text-cyan-400">Avg Sleep</span>
                <div className="text-2xl font-extrabold text-white mt-1">
                  {metrics.avgSleepMinutes > 0 ? fmtSleep(metrics.avgSleepMinutes) : "—"}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {metrics.avgSleepMinutes > 0 ? `${metrics.avgSleepMinutes} mins / night` : "No sleep data"}
                </p>
              </div>

              <div className="glass-panel rounded-2xl p-4 border border-white/10">
                <span className="text-[11px] font-mono uppercase text-amber-400">Experiment</span>
                {metrics.experimentOutcome ? (
                  <div className="text-xs font-semibold text-white mt-1.5 leading-snug">{metrics.experimentOutcome}</div>
                ) : (
                  <div className="text-lg font-extrabold text-slate-500 mt-1">—</div>
                )}
              </div>
            </div>

            {/* Priority breakdown */}
            <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 mb-8">
              <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-4">
                Priority breakdown this week
              </h2>
              <div className="space-y-3">
                {metrics.priorities.map((p) => {
                  const pct = p.weekly_target_minutes > 0
                    ? Math.min(100, Math.round((p.actual_minutes / p.weekly_target_minutes) * 100))
                    : 0;
                  return (
                    <div key={p.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.colour }} />
                          <span className="text-xs font-medium text-white">{p.name}</span>
                        </div>
                        <span className="text-xs font-mono text-slate-400">
                          {p.actual_minutes}m / {p.weekly_target_minutes}m
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/5">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: p.colour }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Weekly Letter */}
            <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 mb-8 relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-2 w-2 rounded-full bg-violet-400" />
                <h2 className="text-xs font-mono uppercase tracking-wider text-violet-300">
                  Weekly Letter (Rule-Based Synthesis)
                </h2>
              </div>

              <div className="rounded-2xl bg-white/[0.02] p-5 sm:p-6 border border-white/5">
                <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-serif italic">
                  &ldquo;{metrics.weeklyLetter}&rdquo;
                </p>
              </div>

              <p className="text-[11px] text-slate-500 mt-3 text-right">
                Generated deterministically from your stored &ldquo;why&rdquo; statement and logged minutes (No AI API required).
              </p>

              {/* Save report to Supabase */}
              <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">
                  {reportSaved
                    ? "✓ Report saved to Supabase for this week."
                    : "Save this report to your Supabase weekly_reports table."}
                </p>
                <button
                  onClick={handleSaveReport}
                  disabled={isSavingReport || reportSaved}
                  className="shrink-0 rounded-xl bg-violet-600/20 border border-violet-500/30 px-4 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingReport ? "Saving…" : reportSaved ? "Saved ✓" : "Save Report"}
                </button>
              </div>
            </div>

            {/* Google Sheets Sync Card */}
            <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
                      Google Sheets Integration
                    </span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      Append Row API
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mt-1">
                    Sync Weekly Summary to Google Sheets
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-lg">
                    Appends exactly one aggregate row to your spreadsheet: Week Start, Display Name, Alignment Score, Completion %, Priority Totals, Sleep, and Experiment Result.
                  </p>
                </div>

                <button
                  onClick={handleSyncToGoogleSheets}
                  disabled={isSyncing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-emerald-700/25 hover:from-emerald-500 hover:to-teal-500 transition-all disabled:opacity-50"
                >
                  {isSyncing ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Syncing Row...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span>Sync to Google Sheets</span>
                    </>
                  )}
                </button>
              </div>

              {/* Privacy Guarantee reminder */}
              <div className="text-[11px] text-slate-500 border-t border-white/[0.06] pt-3">
                <span className="font-semibold text-slate-400">Strict Privacy Guarantee: </span>
                Private notes, mood, energy ratings, phone numbers, and &ldquo;why&rdquo; statements are never transmitted to Sheets.
              </div>

              {/* Sync Result State */}
              {syncResult && (
                <div className="mt-4 pt-4 border-t border-white/[0.08]">
                  {syncResult.success ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-xs text-emerald-200">
                      <div className="font-semibold text-emerald-300">✓ Appended successfully!</div>
                      <p className="mt-1 text-[11px] text-slate-300">
                        Row appended to connected Google Sheet at {syncResult.message || new Date().toLocaleTimeString()}.
                      </p>
                    </div>
                  ) : syncResult.demoMode ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-200">
                      <div className="font-semibold text-amber-300">Demo / Preview Mode:</div>
                      <p className="mt-1 text-[11px] text-slate-300">{syncResult.message}</p>
                      {syncResult.previewRow && (
                        <div className="mt-3 p-2 bg-black/40 rounded-lg text-[10px] font-mono text-slate-300 overflow-x-auto">
                          Columns: [ {Object.keys(syncResult.previewRow).join(" | ")} ]
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-xs text-rose-200">
                      <div className="font-semibold text-rose-300">Sync Error:</div>
                      <p className="mt-1 text-[11px] text-slate-300">{syncResult.message}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
