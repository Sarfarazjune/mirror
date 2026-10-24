"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppNav from "../../components/AppNav";
import { createClient } from "../../lib/supabase/client";

interface CheckinPriority {
  id: string;
  name: string;
  colour: string;
  icon?: string | null;
  weekly_target_minutes?: number;
}

export default function CheckinPage() {
  const router = useRouter();

  // Loading & Session state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // User's active priorities from Supabase
  const [priorities, setPriorities] = useState<CheckinPriority[]>([]);
  const [priorityMinutes, setPriorityMinutes] = useState<Record<string, number>>({});

  // Reflection metrics (matching public.daily_checkins columns)
  const [wastedMinutes, setWastedMinutes] = useState(0);
  const [mood, setMood] = useState<number>(4);
  const [energy, setEnergy] = useState<number>(4);
  const [bedtime, setBedtime] = useState("23:30");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [waterGlasses, setWaterGlasses] = useState(6);
  const [mealQuality, setMealQuality] = useState<"balanced" | "okay" | "skipped">("balanced");
  const [privateNote, setPrivateNote] = useState("");

  const getTodayDate = () => new Date().toISOString().split("T")[0];

  // Calculate sleep duration in hours and minutes
  const calculateSleepDuration = (bed: string, wake: string) => {
    if (!bed || !wake) return "0h 0m";
    const [bH, bM] = bed.split(":").map(Number);
    const [wH, wM] = wake.split(":").map(Number);
    let diffMinutes = wH * 60 + wM - (bH * 60 + bM);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // overnight
    const hrs = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    return `${hrs}h ${mins}m`;
  };

  const calculateSleepMinutes = (bed: string, wake: string) => {
    if (!bed || !wake) return 0;
    const [bH, bM] = bed.split(":").map(Number);
    const [wH, wM] = wake.split(":").map(Number);
    let diffMinutes = wH * 60 + wM - (bH * 60 + bM);
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    return Math.max(0, Math.min(1440, diffMinutes));
  };

  // Fetch initial data from Supabase
  const loadCheckinData = useCallback(async () => {
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

      // 1. Fetch user's active priorities
      const { data: userPriorities, error: prioritiesError } = await db
        .from("priorities")
        .select("id, name, colour, icon, weekly_target_minutes, sort_order")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (prioritiesError) {
        setErrorMessage(`Could not load priorities: ${prioritiesError.message}`);
        setLoading(false);
        return;
      }

      setPriorities(userPriorities || []);

      // 2. Check if a check-in already exists for today to pre-populate
      const todayDate = getTodayDate();
      const { data: existingCheckin, error: checkinError } = await db
        .from("daily_checkins")
        .select(
          "id, mood, energy, bedtime, wake_time, sleep_minutes, water_glasses, meal_quality, wasted_minutes, private_note"
        )
        .eq("user_id", user.id)
        .eq("checkin_date", todayDate)
        .maybeSingle();

      if (checkinError) {
        setErrorMessage(`Could not check existing records: ${checkinError.message}`);
        setLoading(false);
        return;
      }

      if (existingCheckin) {
        if (typeof existingCheckin.mood === "number") setMood(existingCheckin.mood);
        if (typeof existingCheckin.energy === "number") setEnergy(existingCheckin.energy);
        if (existingCheckin.bedtime) setBedtime(existingCheckin.bedtime.slice(0, 5));
        if (existingCheckin.wake_time) setWakeTime(existingCheckin.wake_time.slice(0, 5));
        if (typeof existingCheckin.water_glasses === "number") setWaterGlasses(existingCheckin.water_glasses);
        if (existingCheckin.meal_quality) setMealQuality(existingCheckin.meal_quality);
        if (typeof existingCheckin.wasted_minutes === "number") setWastedMinutes(existingCheckin.wasted_minutes);
        if (existingCheckin.private_note) setPrivateNote(existingCheckin.private_note);

        // Fetch existing time entries for today's checkin
        const { data: entries, error: entriesError } = await db
          .from("time_entries")
          .select("priority_id, minutes")
          .eq("user_id", user.id)
          .eq("checkin_id", existingCheckin.id);

        if (!entriesError && entries) {
          const map: Record<string, number> = {};
          entries.forEach((entry: { priority_id: string; minutes: number }) => {
            map[entry.priority_id] = entry.minutes || 0;
          });
          setPriorityMinutes(map);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load check-in details.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      await loadCheckinData();
    };
    if (!ignore) {
      run();
    }
    return () => {
      ignore = true;
    };
  }, [loadCheckinData]);

  const handleSaveCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSavedSuccess(false);

    // Validation
    if (mood < 1 || mood > 5) {
      setErrorMessage("Mood must be between 1 and 5.");
      return;
    }
    if (energy < 1 || energy > 5) {
      setErrorMessage("Energy must be between 1 and 5.");
      return;
    }
    if (waterGlasses < 0 || waterGlasses > 50) {
      setErrorMessage("Water glasses must be a valid number between 0 and 50.");
      return;
    }
    if (wastedMinutes < 0 || wastedMinutes > 1440) {
      setErrorMessage("Wasted minutes must be between 0 and 1440.");
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
        setErrorMessage("Your session has expired. Please sign in to save your reflection.");
        setSubmitting(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const todayDate = getTodayDate();
      const sleepMinutes = calculateSleepMinutes(bedtime, wakeTime);

      // 1. Upsert public.daily_checkins for current user and today's date
      const { data: savedCheckin, error: checkinError } = await db
        .from("daily_checkins")
        .upsert(
          {
            user_id: user.id,
            checkin_date: todayDate,
            mood,
            energy,
            bedtime: bedtime || null,
            wake_time: wakeTime || null,
            sleep_minutes: sleepMinutes,
            water_glasses: waterGlasses,
            meal_quality: mealQuality,
            wasted_minutes: Math.max(0, wastedMinutes),
            private_note: privateNote.trim() || null,
          },
          { onConflict: "user_id,checkin_date" }
        )
        .select("id")
        .single();

      if (checkinError || !savedCheckin) {
        setErrorMessage(`Failed to save check-in: ${checkinError?.message || "Unknown error"}`);
        setSubmitting(false);
        return;
      }

      const checkinId = savedCheckin.id;

      // 2. Remove existing time entries for this check-in to prevent duplicates upon update
      const { error: deleteError } = await db
        .from("time_entries")
        .delete()
        .eq("checkin_id", checkinId)
        .eq("user_id", user.id);

      if (deleteError) {
        setErrorMessage(`Failed to sync time entries: ${deleteError.message}`);
        setSubmitting(false);
        return;
      }

      // 3. Insert fresh time entries for all priorities
      if (priorities.length > 0) {
        const timeEntriesToInsert = priorities.map((p) => ({
          user_id: user.id,
          checkin_id: checkinId,
          priority_id: p.id,
          minutes: Math.max(0, Number(priorityMinutes[p.id]) || 0),
        }));

        const { error: insertError } = await db
          .from("time_entries")
          .insert(timeEntriesToInsert);

        if (insertError) {
          setErrorMessage(`Failed to record priority minutes: ${insertError.message}`);
          setSubmitting(false);
          return;
        }
      }

      // 4. Success feedback
      setSavedSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred while saving.";
      setErrorMessage(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#040714] text-slate-100 flex flex-col justify-between selection:bg-violet-600">
      <AppNav />

      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/dashboard" className="text-xs text-slate-400 hover:text-white mb-2 inline-block">
            ← Return to Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-white">Daily 45-Second Reflection</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Voluntary check-in on today’s self-directed time and energy.
              </p>
            </div>
            <span className="text-xs font-mono text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 rounded-full">
              ~45 sec
            </span>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="glass-panel rounded-3xl p-8 border border-white/10 text-center my-6">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent mb-2" />
            <p className="text-xs text-slate-400">Loading your focus priorities...</p>
          </div>
        )}

        {/* Unauthenticated Alert */}
        {!loading && !isAuthenticated && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 mb-6 text-center">
            <p className="text-xs font-medium text-amber-200 mb-3">
              You must be signed in to save your daily reflection and sync with your Mirror.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 transition-all"
            >
              Sign In to Continue
            </Link>
          </div>
        )}

        {/* No Priorities Configured Alert */}
        {!loading && isAuthenticated && priorities.length === 0 && (
          <div className="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-5 mb-6 text-center">
            <p className="text-xs font-medium text-violet-200 mb-2">
              No active priorities found. Set up your core domains first to track your time.
            </p>
            <Link
              href="/onboarding"
              className="inline-block rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 transition-all mt-2"
            >
              Complete Onboarding Setup →
            </Link>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-4 text-xs text-rose-300 mb-6">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Success Feedback */}
        {savedSuccess && (
          <div className="rounded-2xl border border-teal-500/40 bg-teal-950/30 p-4 text-xs text-teal-200 mb-6 text-center animate-in fade-in">
            ✓ Reflection saved. Updating your Mirror Score and active experiment...
          </div>
        )}

        {!loading && isAuthenticated && (
          <form onSubmit={handleSaveCheckin} className="space-y-6">
            {/* Priority Minutes Section */}
            <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                1. Self-Directed Priority Minutes Today
              </h3>

              {priorities.length > 0 ? (
                <div className="space-y-3">
                  {priorities.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl bg-white/[0.02] p-3 border border-white/5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: p.colour || "#8b5cf6" }}
                        />
                        <span className="text-xs font-medium text-white">{p.name}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step={5}
                          max={720}
                          value={priorityMinutes[p.id] ?? 0}
                          onChange={(e) =>
                            setPriorityMinutes({
                              ...priorityMinutes,
                              [p.id]: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="w-20 rounded-lg bg-black/50 px-2.5 py-1.5 text-xs text-right font-mono text-cyan-300 border border-white/10 focus:border-violet-400 focus:outline-none"
                        />
                        <span className="text-[11px] text-slate-400">mins</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No priorities defined.</p>
              )}

              {/* Unplanned/Scrolling Time */}
              <div className="mt-4 pt-4 border-t border-white/[0.08] flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-amber-300">
                    Time I would call wasted or scrolling
                  </span>
                  <p className="text-[11px] text-slate-400">Unplanned lost time</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={5}
                    max={720}
                    value={wastedMinutes}
                    onChange={(e) => setWastedMinutes(Math.max(0, Number(e.target.value)))}
                    className="w-20 rounded-lg bg-black/50 px-2.5 py-1.5 text-xs text-right font-mono text-amber-300 border border-white/10 focus:border-amber-400 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-400">mins</span>
                </div>
              </div>
            </div>

            {/* Mood & Energy Section */}
            <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                2. Mood & Energy (1 to 5)
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Overall Mood</label>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setMood(val)}
                        className={`flex-1 py-2 text-xs rounded-lg font-bold border transition-all ${
                          mood === val
                            ? "bg-violet-600 text-white border-violet-400 shadow"
                            : "bg-white/[0.03] text-slate-400 border-white/5 hover:border-white/20"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-2">Physical Energy</label>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setEnergy(val)}
                        className={`flex-1 py-2 text-xs rounded-lg font-bold border transition-all ${
                          energy === val
                            ? "bg-teal-600 text-white border-teal-400 shadow"
                            : "bg-white/[0.03] text-slate-400 border-white/5 hover:border-white/20"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Sleep, Water & Meal Quality */}
            <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                3. Rest & Foundations
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Bedtime & Wake time</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={bedtime}
                      onChange={(e) => setBedtime(e.target.value)}
                      className="flex-1 rounded-lg bg-black/40 p-2 text-xs text-white border border-white/10 focus:outline-none"
                    />
                    <span className="text-xs text-slate-500">to</span>
                    <input
                      type="time"
                      value={wakeTime}
                      onChange={(e) => setWakeTime(e.target.value)}
                      className="flex-1 rounded-lg bg-black/40 p-2 text-xs text-white border border-white/10 focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-cyan-300 mt-1.5">
                    Calculated duration: {calculateSleepDuration(bedtime, wakeTime)}
                  </p>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Water Glasses</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={waterGlasses}
                    onChange={(e) => setWaterGlasses(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-lg bg-black/40 p-2 text-xs text-white border border-white/10 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Meal Quality</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["balanced", "okay", "skipped"] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setMealQuality(q)}
                      className={`py-2 text-xs rounded-xl font-medium border capitalize transition-all ${
                        mealQuality === q
                          ? "bg-violet-600/30 text-violet-200 border-violet-400"
                          : "bg-white/[0.02] text-slate-400 border-white/5 hover:border-white/20"
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Optional Short Private Note (max 300 chars) */}
            <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  4. Private Reflection Note (Optional)
                </label>
                <span className="text-[11px] text-slate-500">
                  {privateNote.length}/300 chars
                </span>
              </div>
              <textarea
                rows={2}
                maxLength={300}
                value={privateNote}
                onChange={(e) => setPrivateNote(e.target.value)}
                placeholder="What felt peaceful today? What felt hurried? (Kept private, never synced to Sheets)"
                className="w-full resize-none rounded-xl bg-white/[0.03] p-3 text-xs text-white placeholder-slate-500 border border-white/10 focus:border-violet-400 focus:outline-none"
              />
            </div>

            {/* Save Action */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-teal-600 py-4 text-sm font-semibold text-white shadow-xl shadow-violet-600/30 hover:scale-[1.01] hover:shadow-violet-600/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving Daily Reflection..." : "Save Daily Reflection & Update Mirror"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
