"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppNav from "../../components/AppNav";
import IntentionRadar from "../../components/IntentionRadar";
import { calculateMirrorScore } from "../../lib/mirror-engine";
import { SAMPLE_ALEX_DATA } from "../../lib/sample-data";
import { createClient } from "../../lib/supabase/client";

interface DashboardPriority {
  id: string;
  name: string;
  why: string;
  targetMinutes: number;
  actualMinutes: number;
  colour: string;
}

interface ActiveExperimentState {
  id: string;
  targetPriorityName: string;
  transferMinutesPerDay: number;
  daysCompleted: number;
  totalDays: number;
  extraMinutesGained: number;
  startDate: string;
  endDate: string;
}

export default function DashboardPage() {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Authenticated user state
  const [userName, setUserName] = useState<string>("Reflector");
  const [priorities, setPriorities] = useState<DashboardPriority[]>([]);
  const [wastedMinutes, setWastedMinutes] = useState<number>(0);
  const [activeExperiment, setActiveExperiment] = useState<ActiveExperimentState | null>(null);
  const [checkinTodayDone, setCheckinTodayDone] = useState<boolean>(false);
  const [hasCheckedInThisWeek, setHasCheckedInThisWeek] = useState<boolean>(false);

  // Helper: calculate Monday start of current week in YYYY-MM-DD
  const getWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split("T")[0];
  };

  const getTodayDate = () => {
    return new Date().toISOString().split("T")[0];
  };

  const fetchLiveDashboardData = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        // Fallback to sample demo mode if not signed in
        setIsDemoMode(true);
        setLoading(false);
        return;
      }

      // 1. Fetch Profile display name
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: profile } = await db
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.display_name) {
        setUserName(profile.display_name);
      } else if (user.user_metadata?.full_name) {
        setUserName(user.user_metadata.full_name);
      } else if (user.phone) {
        setUserName(user.phone);
      } else {
        setUserName("Reflector");
      }

      // 2. Fetch Active Priorities
      const { data: userPriorities, error: prioritiesError } = await db
        .from("priorities")
        .select("id, name, colour, icon, why_statement, weekly_target_minutes, sort_order, active")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (prioritiesError) {
        setErrorMessage(`Could not load priorities: ${prioritiesError.message}`);
        setLoading(false);
        return;
      }

      const weekStart = getWeekStart();
      const todayDate = getTodayDate();

      // 3. Fetch Daily Checkins for current week (from Monday onward)
      const { data: checkins, error: checkinsError } = await db
        .from("daily_checkins")
        .select("id, checkin_date, wasted_minutes")
        .eq("user_id", user.id)
        .gte("checkin_date", weekStart);

      if (checkinsError) {
        setErrorMessage(`Could not load check-ins: ${checkinsError.message}`);
        setLoading(false);
        return;
      }

      // Check if user checked in today
      const todayCheckin = checkins?.find((c: { checkin_date: string }) => c.checkin_date === todayDate);
      setCheckinTodayDone(Boolean(todayCheckin));

      // Sum wasted minutes for the current week
      const totalWasted = checkins?.reduce(
        (sum: number, c: { wasted_minutes: number | null }) => sum + (c.wasted_minutes || 0),
        0
      ) || 0;
      setWastedMinutes(totalWasted);

      // Check if user has any recorded check-ins this week
      const checkinIds = checkins?.map((c: { id: string }) => c.id) || [];
      setHasCheckedInThisWeek(checkinIds.length > 0);

      // 4. Fetch Time Entries for this week's checkins
      const actualMinutesMap: Record<string, number> = {};
      if (checkinIds.length > 0) {
        const { data: timeEntries, error: timeEntriesError } = await db
          .from("time_entries")
          .select("priority_id, minutes")
          .eq("user_id", user.id)
          .in("checkin_id", checkinIds);

        if (timeEntriesError) {
          setErrorMessage(`Could not load time entries: ${timeEntriesError.message}`);
          setLoading(false);
          return;
        }

        timeEntries?.forEach((entry: { priority_id: string; minutes: number }) => {
          actualMinutesMap[entry.priority_id] =
            (actualMinutesMap[entry.priority_id] || 0) + (entry.minutes || 0);
        });
      }

      // Map priorities with actual logged minutes
      const mappedPriorities: DashboardPriority[] = (userPriorities || []).map(
        (p: { id: string; name: string; why_statement: string; weekly_target_minutes: number; colour: string }) => ({
          id: p.id,
          name: p.name,
          why: p.why_statement,
          targetMinutes: p.weekly_target_minutes,
          actualMinutes: actualMinutesMap[p.id] || 0,
          colour: p.colour,
        })
      );
      setPriorities(mappedPriorities);

      // 5. Fetch Active Experiment
      const { data: experimentData } = await db
        .from("experiments")
        .select("id, target_priority_id, transfer_minutes_per_day, starts_on, ends_on, status, created_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (experimentData) {
        const targetPriority = mappedPriorities.find((p) => p.id === experimentData.target_priority_id);
        const targetName = targetPriority?.name || "Target Priority";

        // Calculate elapsed days within the 7-day experiment window
        const startDateMs = new Date(experimentData.starts_on).getTime();
        const todayMs = new Date(todayDate).getTime();
        const dayDifference = Math.floor((todayMs - startDateMs) / (1000 * 60 * 60 * 24)) + 1;
        const daysCompleted = Math.max(1, Math.min(7, isNaN(dayDifference) ? 1 : dayDifference));
        const extraMinutesGained = daysCompleted * (experimentData.transfer_minutes_per_day || 20);

        setActiveExperiment({
          id: experimentData.id,
          targetPriorityName: targetName,
          transferMinutesPerDay: experimentData.transfer_minutes_per_day || 20,
          daysCompleted,
          totalDays: 7,
          extraMinutesGained,
          startDate: experimentData.starts_on,
          endDate: experimentData.ends_on,
        });
      } else {
        setActiveExperiment(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load dashboard data from Supabase.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      await fetchLiveDashboardData();
    };
    if (!ignore) {
      run();
    }
    return () => {
      ignore = true;
    };
  }, [fetchLiveDashboardData]);

  // Determine active view model (live Supabase vs Sample Alex mode)
  const displayUserName = isDemoMode ? SAMPLE_ALEX_DATA.user.name : userName;
  const displayPriorities = isDemoMode
    ? SAMPLE_ALEX_DATA.priorities.map((p) => ({
        id: p.id,
        name: p.name,
        why: p.why,
        targetMinutes: p.targetMinutes,
        actualMinutes: p.actualMinutes,
        colour: p.colour,
      }))
    : priorities;

  const displayWastedMinutes = isDemoMode ? SAMPLE_ALEX_DATA.wastedMinutes : wastedMinutes;
  const displayExperiment = isDemoMode ? SAMPLE_ALEX_DATA.activeExperiment : activeExperiment;
  const displayCheckinDone = isDemoMode ? SAMPLE_ALEX_DATA.checkinTodayDone : checkinTodayDone;

  // Calculate live Mirror Score
  const mirrorResult = calculateMirrorScore(
    displayPriorities.map((p) => ({
      name: p.name,
      targetMinutes: p.targetMinutes,
      actualMinutes: p.actualMinutes,
      colour: p.colour,
    })),
    displayWastedMinutes
  );

  // Radar data formatting
  const radarItems = displayPriorities.map((p) => ({
    name: p.name,
    intended: mirrorResult.intendedShares[p.name] || 0,
    actual: mirrorResult.actualShares[p.name] || 0,
    colour: p.colour,
  }));

  const handleToggleDemo = () => {
    setIsDemoMode(!isDemoMode);
  };

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-[#040714] text-slate-100 flex flex-col justify-between selection:bg-violet-600">
      <AppNav isDemoMode={isDemoMode} onToggleDemo={handleToggleDemo} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-8">
        {/* Error notification banner */}
        {errorMessage && (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4 text-xs text-rose-300 flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={() => fetchLiveDashboardData()}
              className="text-white underline font-semibold ml-4"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <p className="text-xs font-mono tracking-wider text-slate-400 uppercase">
              Consulting your reflection from Supabase...
            </p>
          </div>
        ) : !isDemoMode && displayPriorities.length === 0 ? (
          /* Empty State: User has not completed onboarding yet */
          <div className="glass-panel rounded-3xl p-8 sm:p-12 border border-white/10 text-center max-w-xl mx-auto my-12 space-y-6">
            <div className="h-14 w-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto text-violet-300">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Your mirror is waiting to be cast</h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                You haven&apos;t chosen your core priorities yet. Take 2 minutes to select what matters and write your anchor statements.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/onboarding"
                className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-violet-600 to-teal-600 px-6 py-3 text-xs font-semibold text-white shadow-lg shadow-violet-600/30 hover:opacity-90 transition-all"
              >
                Begin Onboarding →
              </Link>
              <button
                type="button"
                onClick={() => setIsDemoMode(true)}
                className="w-full sm:w-auto rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]"
              >
                Load Sample Week
              </button>
            </div>
          </div>
        ) : (
          /* Main Dashboard Content */
          <>
            {/* Top Greeting & Date */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                  Good evening, {displayUserName}.
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  {currentDate} · Your weekly reflection is in progress.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/check-in"
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 transition-all"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>{displayCheckinDone ? "Update Today's Check-in" : "Complete Daily Check-in"}</span>
                </Link>
              </div>
            </div>

            {/* Central Frosted Mirror & Radar Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch mb-8">
              {/* Main Visual Mirror: Clarity based on Score */}
              <div className="lg:col-span-7 glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 flex flex-col justify-between relative overflow-hidden">
                {/* Ambient reflection illumination */}
                <div
                  className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-violet-600/20 blur-[80px]"
                  aria-hidden="true"
                />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono uppercase tracking-wider text-violet-400">
                      Intention vs. Reality Reflection
                    </span>
                    <span className="text-xs text-slate-400">
                      Voluntary Logged Time
                    </span>
                  </div>

                  {/* The Radar */}
                  <IntentionRadar items={radarItems} score={mirrorResult.score} />
                </div>

                {/* Non-judgmental status caption */}
                <div className="mt-6 pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                  <p className="text-slate-300 italic">
                    &ldquo;{mirrorResult.summaryMessage}&rdquo;
                  </p>
                  <span className="text-[11px] font-mono text-slate-500">
                    Formula: 100 × (1 − 0.5 × Δshares)
                  </span>
                </div>
              </div>

              {/* Right Metrics Panel: Mirror Score & Active Experiment */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                {/* Mirror Score Card */}
                <div className="glass-panel rounded-3xl p-6 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                      Mirror Score
                    </span>
                    <span className="text-[11px] text-slate-400">Relative Alignment</span>
                  </div>

                  <div className="flex items-baseline gap-3 my-2">
                    <span className="text-5xl font-extrabold tracking-tight text-white">
                      {mirrorResult.score}%
                    </span>
                    <span className="text-xs font-semibold text-cyan-300">
                      aligned
                    </span>
                  </div>

                  {/* Clear next action rather than guilt */}
                  <div className="mt-4 rounded-xl bg-violet-950/30 p-3.5 border border-violet-500/20 text-xs">
                    <span className="font-semibold text-violet-300">Clear next action: </span>
                    <span className="text-slate-200">
                      {!isDemoMode && !hasCheckedInThisWeek
                        ? "Complete your first 45-second check-in to reflect today's time."
                        : `Try moving 20 minutes from scrolling to ${displayPriorities[0]?.name || "your focus"} today.`}
                    </span>
                  </div>

                  {/* Completion Progress Separately */}
                  <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-xs text-slate-400">
                    <span>Total planned minutes completed:</span>
                    <span className="font-bold text-white">
                      {mirrorResult.targetCompletionPercent}%
                    </span>
                  </div>
                </div>

                {/* Active 7-Day Experiment Card */}
                <div className="glass-panel rounded-3xl p-6 border border-white/10 flex-1 flex flex-col justify-between">
                  {displayExperiment ? (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono uppercase tracking-wider text-teal-400">
                          Active 7-Day Experiment
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Day {displayExperiment.daysCompleted} of {displayExperiment.totalDays}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-white mt-1">
                        +{displayExperiment.transferMinutesPerDay}m / day to {displayExperiment.targetPriorityName}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Reclaiming {displayExperiment.transferMinutesPerDay} minutes of unplanned scrolling time.
                      </p>

                      {/* Experiment progress */}
                      <div className="mt-4 rounded-xl bg-black/40 p-3 border border-white/5 space-y-2">
                        <div className="flex justify-between text-xs text-slate-300">
                          <span>Sessions completed</span>
                          <span className="font-bold text-teal-300">
                            {displayExperiment.daysCompleted} / {displayExperiment.totalDays}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-teal-400 to-violet-500"
                            style={{
                              width: `${(displayExperiment.daysCompleted / displayExperiment.totalDays) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-400 pt-1">
                          Gained so far: <span className="text-white font-medium">+{displayExperiment.extraMinutesGained} minutes</span> this week.
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Empty experiment state */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono uppercase tracking-wider text-teal-400">
                          7-Day Experiment
                        </span>
                        <span className="text-[11px] text-slate-500">None Active</span>
                      </div>
                      <h3 className="text-sm font-bold text-white">No active experiment</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Test moving 10–30 minutes a day from scrolling into your craft. Start one small 7-day commitment in Future Lab.
                      </p>
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
                    <Link
                      href="/future-lab"
                      className="text-xs font-semibold text-violet-300 hover:text-violet-200 inline-flex items-center gap-1"
                    >
                      <span>Go to Future Lab</span>
                      <span>→</span>
                    </Link>
                    <Link
                      href="/weekly-review"
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Weekly Letter Preview
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Priority Progress Cards */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Chosen Life Priorities & Weekly Minutes
                </h2>
                <span className="text-xs text-slate-500">
                  {displayPriorities.length} active priorities
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {displayPriorities.map((priority) => {
                  const percent = Math.min(
                    100,
                    priority.targetMinutes > 0
                      ? Math.round((priority.actualMinutes / priority.targetMinutes) * 100)
                      : 0
                  );
                  return (
                    <div
                      key={priority.id}
                      className="glass-panel rounded-2xl p-5 border border-white/10 hover:border-white/20 transition-all"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: priority.colour }}
                        />
                        <span className="text-xs font-bold text-slate-400">
                          {priority.actualMinutes} / {priority.targetMinutes}m
                        </span>
                      </div>

                      <h3 className="font-bold text-sm text-white">{priority.name}</h3>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                        &ldquo;{priority.why}&rdquo;
                      </p>

                      <div className="mt-4 space-y-1">
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              backgroundColor: priority.colour,
                              width: `${percent}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span>{percent}% of target</span>
                          <span>
                            {priority.targetMinutes - priority.actualMinutes > 0
                              ? `${priority.targetMinutes - priority.actualMinutes}m to go`
                              : "Target reached"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unplanned / Scrolling Time Strip */}
            <div className="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Unplanned & Scrolling Time: {displayWastedMinutes} minutes this week
                  </h3>
                  <p className="text-xs text-slate-400">
                    Logged voluntarily as time you felt slipped away without intention.
                  </p>
                </div>
              </div>

              <Link
                href="/future-lab"
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.08] transition-colors text-center"
              >
                Simulate reclaiming in Future Lab →
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
