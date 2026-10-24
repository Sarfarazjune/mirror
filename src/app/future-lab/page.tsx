"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppNav from "../../components/AppNav";
import { calculateFutureLabImpact } from "../../lib/mirror-engine";
import { createClient } from "../../lib/supabase/client";

interface LabPriority {
  id: string;
  name: string;
  colour: string;
  weekly_target_minutes: number;
  actual_minutes_this_week: number; // derived from time_entries aggregation
}

interface ActiveExperiment {
  id: string;
  target_priority_id: string;
  target_priority_name: string;
  transfer_minutes_per_day: number;
  starts_on: string;
  ends_on: string;
}

export default function FutureLabPage() {
  // Session & loading
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Priorities from Supabase
  const [priorities, setPriorities] = useState<LabPriority[]>([]);

  // Active experiment
  const [activeExperiment, setActiveExperiment] = useState<ActiveExperiment | null>(null);
  const [experimentStarted, setExperimentStarted] = useState(false);

  // Simulator state
  const [selectedPriorityId, setSelectedPriorityId] = useState<string>("");
  const [sliderMinutes, setSliderMinutes] = useState(20);

  const getTodayDate = () => new Date().toISOString().split("T")[0];

  const getDatePlusDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  };

  const getWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split("T")[0];
  };

  const loadLabData = useCallback(async () => {
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

      // 1. Fetch active priorities
      const { data: rawPriorities, error: prioritiesError } = await db
        .from("priorities")
        .select("id, name, colour, weekly_target_minutes, sort_order")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (prioritiesError) {
        setErrorMessage(`Could not load priorities: ${prioritiesError.message}`);
        setLoading(false);
        return;
      }

      const priorityList: LabPriority[] = (rawPriorities || []).map(
        (p: { id: string; name: string; colour: string; weekly_target_minutes: number }) => ({
          id: p.id,
          name: p.name,
          colour: p.colour,
          weekly_target_minutes: p.weekly_target_minutes,
          actual_minutes_this_week: 0,
        })
      );

      // 2. Fetch this week's time entries to show "currently X min/wk" in the picker
      if (priorityList.length > 0) {
        const weekStart = getWeekStart();
        const { data: checkins } = await db
          .from("daily_checkins")
          .select("id")
          .eq("user_id", user.id)
          .gte("checkin_date", weekStart);

        const checkinIds = (checkins || []).map((c: { id: string }) => c.id);

        if (checkinIds.length > 0) {
          const { data: timeEntries } = await db
            .from("time_entries")
            .select("priority_id, minutes")
            .eq("user_id", user.id)
            .in("checkin_id", checkinIds);

          if (timeEntries) {
            const minutesMap: Record<string, number> = {};
            timeEntries.forEach((e: { priority_id: string; minutes: number }) => {
              minutesMap[e.priority_id] = (minutesMap[e.priority_id] || 0) + (e.minutes || 0);
            });
            priorityList.forEach((p) => {
              p.actual_minutes_this_week = minutesMap[p.id] || 0;
            });
          }
        }
      }

      setPriorities(priorityList);
      if (priorityList.length > 0 && !selectedPriorityId) {
        setSelectedPriorityId(priorityList[0].id);
      }

      // 3. Check for an existing active experiment
      const { data: existingExp, error: expError } = await db
        .from("experiments")
        .select("id, target_priority_id, transfer_minutes_per_day, starts_on, ends_on, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (expError) {
        setErrorMessage(`Could not check experiments: ${expError.message}`);
        setLoading(false);
        return;
      }

      if (existingExp) {
        const linkedPriority = priorityList.find((p) => p.id === existingExp.target_priority_id);
        setActiveExperiment({
          id: existingExp.id,
          target_priority_id: existingExp.target_priority_id,
          target_priority_name: linkedPriority?.name || "a priority",
          transfer_minutes_per_day: existingExp.transfer_minutes_per_day,
          starts_on: existingExp.starts_on,
          ends_on: existingExp.ends_on,
        });
        // Pre-select its priority in the simulator
        setSelectedPriorityId(existingExp.target_priority_id);
        setSliderMinutes(existingExp.transfer_minutes_per_day);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load Future Lab data.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      await loadLabData();
    };
    if (!ignore) {
      run();
    }
    return () => {
      ignore = true;
    };
  }, [loadLabData]);

  const handleStartExperiment = async () => {
    setErrorMessage(null);

    if (!selectedPriorityId) {
      setErrorMessage("Please select a destination priority first.");
      return;
    }
    if (sliderMinutes <= 0) {
      setErrorMessage("Please set at least 1 minute per day to run an experiment.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setErrorMessage("Your session has expired. Please sign in to start an experiment.");
        setSubmitting(false);
        return;
      }

      // Confirm the selected priority belongs to this user
      const ownedPriority = priorities.find((p) => p.id === selectedPriorityId);
      if (!ownedPriority) {
        setErrorMessage("Selected priority not found. Please reload and try again.");
        setSubmitting(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const todayDate = getTodayDate();
      const endDate = getDatePlusDays(6); // 7 days inclusive: starts_on + 6 days = ends_on

      // Save to public.experiments
      const { data: newExp, error: insertError } = await db
        .from("experiments")
        .insert({
          user_id: user.id,
          target_priority_id: selectedPriorityId,
          transfer_minutes_per_day: sliderMinutes,
          starts_on: todayDate,
          ends_on: endDate,
          status: "active",
        })
        .select("id, target_priority_id, transfer_minutes_per_day, starts_on, ends_on")
        .single();

      if (insertError) {
        setErrorMessage(`Could not start experiment: ${insertError.message}`);
        setSubmitting(false);
        return;
      }

      setActiveExperiment({
        id: newExp.id,
        target_priority_id: newExp.target_priority_id,
        target_priority_name: ownedPriority.name,
        transfer_minutes_per_day: newExp.transfer_minutes_per_day,
        starts_on: newExp.starts_on,
        ends_on: newExp.ends_on,
      });
      setExperimentStarted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelExperiment = async () => {
    if (!activeExperiment) return;
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setErrorMessage("Session expired. Please sign in.");
        setSubmitting(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { error: updateError } = await db
        .from("experiments")
        .update({ status: "abandoned" })
        .eq("id", activeExperiment.id)
        .eq("user_id", user.id);

      if (updateError) {
        setErrorMessage(`Could not cancel experiment: ${updateError.message}`);
        setSubmitting(false);
        return;
      }

      setActiveExperiment(null);
      setExperimentStarted(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPriority = priorities.find((p) => p.id === selectedPriorityId) || priorities[0];

  const impact = calculateFutureLabImpact(
    selectedPriority?.actual_minutes_this_week ?? 0,
    sliderMinutes
  );

  return (
    <div className="min-h-screen bg-[#040714] text-slate-100 flex flex-col justify-between selection:bg-violet-600">
      <AppNav />

      <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/dashboard" className="text-xs text-slate-400 hover:text-white mb-2 inline-block">
            ← Return to Dashboard
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300 mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
            <span>Future Lab · Standout Simulation Feature</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
            Simulate one small change.
          </h1>
          <p className="text-sm text-slate-400 mt-2 max-w-lg mx-auto">
            Test what happens when you transfer just a fraction of scrolling time into your craft over a whole year.
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="glass-panel rounded-3xl p-10 border border-white/10 text-center mb-8">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent mb-3" />
            <p className="text-xs text-slate-400">Loading your priorities and experiments...</p>
          </div>
        )}

        {/* Unauthenticated */}
        {!loading && !isAuthenticated && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-6 mb-8 text-center">
            <p className="text-sm font-medium text-amber-200 mb-4">
              Sign in to run simulations using your real priorities and start a tracked 7-day experiment.
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
        {!loading && isAuthenticated && priorities.length === 0 && (
          <div className="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-6 mb-8 text-center">
            <p className="text-sm font-medium text-violet-200 mb-4">
              No active priorities found. Set up your core life domains first.
            </p>
            <Link
              href="/onboarding"
              className="inline-block rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-violet-500 transition-all"
            >
              Complete Onboarding Setup →
            </Link>
          </div>
        )}

        {/* Error */}
        {errorMessage && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-4 text-xs text-rose-300 mb-6">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Active experiment already exists banner */}
        {!loading && isAuthenticated && activeExperiment && !experimentStarted && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-amber-300 mb-1">
                  ⚡ You already have an active experiment
                </p>
                <p className="text-xs text-slate-300">
                  <span className="font-semibold text-white">{activeExperiment.transfer_minutes_per_day} min/day</span>
                  {" "}to{" "}
                  <span className="font-semibold text-white">{activeExperiment.target_priority_name}</span>
                  {" "}· Ends on{" "}
                  <span className="font-mono text-amber-200">{activeExperiment.ends_on}</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  You can only have one active experiment at a time. Cancel it to start a new one.
                </p>
              </div>
              <button
                onClick={handleCancelExperiment}
                disabled={submitting}
                className="shrink-0 rounded-xl border border-rose-500/40 bg-rose-950/20 px-3 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10 transition-all disabled:opacity-50"
              >
                {submitting ? "Cancelling..." : "Cancel Experiment"}
              </button>
            </div>
          </div>
        )}

        {/* Main Simulator Card — only shown when loaded and authenticated with priorities */}
        {!loading && isAuthenticated && priorities.length > 0 && (
          <div className="glass-panel rounded-3xl p-6 sm:p-10 border border-white/10 shadow-2xl relative overflow-hidden mb-8">
            <div
              className="pointer-events-none absolute -top-32 -left-32 h-72 w-72 rounded-full bg-teal-600/15 blur-[100px]"
              aria-hidden="true"
            />

            {/* Priority Picker */}
            <div className="mb-8">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                1. Choose destination priority
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {priorities.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPriorityId(p.id);
                      setExperimentStarted(false);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      selectedPriorityId === p.id
                        ? "bg-violet-600/20 border-violet-400 text-white shadow-lg"
                        : "bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/15"
                    }`}
                  >
                    <span
                      className="block h-2 w-2 rounded-full mb-2"
                      style={{ backgroundColor: p.colour || "#8b5cf6" }}
                    />
                    <div className="text-xs font-bold text-white truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Currently ~{p.actual_minutes_this_week}m/wk
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Slider */}
            <div className="mb-8 rounded-2xl bg-black/40 p-6 border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-xs font-semibold text-slate-300">
                    Move minutes per day from scrolling/unplanned time:
                  </span>
                  <p className="text-[11px] text-slate-500">Range: 0 to 60 minutes daily</p>
                </div>
                <span className="text-2xl font-extrabold font-mono text-teal-300">
                  {sliderMinutes} <span className="text-xs font-normal text-slate-400">min/day</span>
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={60}
                step={5}
                value={sliderMinutes}
                onChange={(e) => {
                  setSliderMinutes(Number(e.target.value));
                  setExperimentStarted(false);
                }}
                className="w-full accent-teal-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />

              <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono">
                <span>0 min</span>
                <span>15 min</span>
                <span>30 min</span>
                <span>45 min</span>
                <span>60 min</span>
              </div>
            </div>

            {/* Real-time Year Compound Arithmetic Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="glass-panel-subtle rounded-2xl p-4 border border-white/5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  Current Effort
                </span>
                <div className="text-2xl font-extrabold text-white mt-1">
                  {impact.currentYearlyHours} <span className="text-xs font-normal text-slate-400">hours/year</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  At your current pace (~{selectedPriority?.actual_minutes_this_week ?? 0} min/wk)
                </p>
              </div>

              <div className="glass-panel-subtle rounded-2xl p-4 border border-teal-500/20 bg-teal-950/10">
                <span className="text-[11px] font-mono uppercase tracking-wider text-teal-300">
                  Added This Year
                </span>
                <div className="text-2xl font-extrabold text-teal-300 mt-1">
                  +{impact.addedYearlyHours} <span className="text-xs font-normal text-teal-400">hours</span>
                </div>
                <p className="text-[10px] text-teal-400/80 mt-1">
                  Formula: {sliderMinutes}m × 365 ÷ 60
                </p>
              </div>

              <div className="glass-panel-subtle rounded-2xl p-4 border border-violet-500/20 bg-violet-950/10">
                <span className="text-[11px] font-mono uppercase tracking-wider text-violet-300">
                  Projected Total
                </span>
                <div className="text-2xl font-extrabold text-violet-200 mt-1">
                  {impact.projectedYearlyHours} <span className="text-xs font-normal text-slate-400">hours/year</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Combined annual trajectory
                </p>
              </div>
            </div>

            {/* Encouraging message */}
            <div className="rounded-xl bg-white/[0.02] p-4 border border-white/5 text-xs text-slate-300 italic text-center mb-8">
              &ldquo;{impact.encouragingMessage}&rdquo;
            </div>

            {/* Experiment Button Area */}
            {experimentStarted && activeExperiment ? (
              <div className="rounded-2xl border border-teal-500/30 bg-teal-950/30 p-5 text-center space-y-2 animate-in fade-in">
                <div className="text-xs font-bold text-teal-300">
                  ✓ 7-Day Experiment Active!
                </div>
                <p className="text-xs text-slate-200">
                  Goal: Dedicate +{activeExperiment.transfer_minutes_per_day} minutes daily to{" "}
                  {activeExperiment.target_priority_name} for the next 7 days.
                </p>
                <p className="text-[11px] text-slate-400">
                  Ends on <span className="font-mono text-teal-300">{activeExperiment.ends_on}</span>. Track your progress in daily check-ins.
                </p>
                <div className="pt-2">
                  <Link
                    href="/dashboard"
                    className="inline-block rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-500"
                  >
                    View on Dashboard →
                  </Link>
                </div>
              </div>
            ) : activeExperiment ? (
              // Already has an active experiment — can't start another
              <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-950/10 py-4 text-center text-xs text-amber-300">
                Cancel your existing experiment above to start a new one.
              </div>
            ) : (
              <button
                onClick={handleStartExperiment}
                disabled={sliderMinutes === 0 || submitting || !selectedPriorityId}
                className="w-full rounded-2xl bg-gradient-to-r from-teal-600 via-indigo-600 to-violet-600 py-4 text-sm font-semibold text-white shadow-xl shadow-teal-600/25 hover:scale-[1.01] hover:shadow-teal-600/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? "Starting experiment..."
                  : `Start my 7-day experiment (+${sliderMinutes}m/day to ${selectedPriority?.name ?? "priority"})`}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
