"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import IntentionRadar from "../../components/IntentionRadar";
import { createClient } from "../../lib/supabase/client";

interface CustomPriority {
  id: string;
  name: string;
  why: string;
  weeklyTargetMinutes: number;
  colour: string;
  icon?: string;
}

const PRESET_OPTIONS = [
  { name: "Guitar & Music", defaultWhy: "The one thing that makes me feel like myself and grounds my creativity.", colour: "#8b5cf6" },
  { name: "Strength & Fitness", defaultWhy: "Clears mental brain fog and keeps my physical energy high.", colour: "#06b6d4" },
  { name: "Computer Science & Study", defaultWhy: "Building my foundation so I have the freedom to ship meaningful work.", colour: "#3b82f6" },
  { name: "Deep Reading", defaultWhy: "Expands my mental models beyond fast, distracted social feeds.", colour: "#f59e0b" },
  { name: "True Friendships", defaultWhy: "Cultivating reciprocal, honest relationships that matter long-term.", colour: "#ec4899" },
  { name: "Creative Writing", defaultWhy: "Processing my thoughts clearly through structured written prose.", colour: "#10b981" },
];

export default function OnboardingPage() {
  const router = useRouter();

  const [selectedPriorities, setSelectedPriorities] = useState<CustomPriority[]>([
    {
      id: "p1",
      name: "Guitar & Music",
      why: "The one thing that makes me feel like myself and grounds my creativity.",
      weeklyTargetMinutes: 180,
      colour: "#8b5cf6",
    },
    {
      id: "p2",
      name: "Strength & Fitness",
      why: "Clears mental brain fog and keeps my physical energy high.",
      weeklyTargetMinutes: 150,
      colour: "#06b6d4",
    },
    {
      id: "p3",
      name: "Computer Science & Study",
      why: "Building my foundation so I have the freedom to ship meaningful work.",
      weeklyTargetMinutes: 300,
      colour: "#3b82f6",
    },
  ]);

  const [reminderTime, setReminderTime] = useState("21:00");
  const [customName, setCustomName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error !== "profile_status_unavailable") return;

    const timeout = window.setTimeout(() => {
      setErrorMessage(
        "Your sign-in succeeded, but Mirror could not read your profile status. You can try saving your onboarding details to finish setup."
      );
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const handleTogglePreset = (preset: typeof PRESET_OPTIONS[0]) => {
    const exists = selectedPriorities.find((p) => p.name === preset.name);
    if (exists) {
      if (selectedPriorities.length <= 3) {
        alert("Please keep at least 3 priorities to build your balance radar.");
        return;
      }
      setSelectedPriorities(selectedPriorities.filter((p) => p.name !== preset.name));
    } else {
      if (selectedPriorities.length >= 5) {
        alert("Mirror recommends choosing at most 5 priorities to maintain clear daily focus.");
        return;
      }
      const newId = `p-${preset.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      setSelectedPriorities((prev) => [
        ...prev,
        {
          id: newId,
          name: preset.name,
          why: preset.defaultWhy,
          weeklyTargetMinutes: 120,
          colour: preset.colour,
        },
      ]);
    }
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    if (selectedPriorities.length >= 5) {
      alert("Mirror recommends choosing at most 5 priorities.");
      return;
    }
    const colours = ["#8b5cf6", "#06b6d4", "#3b82f6", "#f59e0b", "#ec4899", "#10b981"];
    const colour = colours[selectedPriorities.length % colours.length];
    const customId = `custom-${customName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    setSelectedPriorities((prev) => [
      ...prev,
      {
        id: customId,
        name: customName.trim(),
        why: "Essential to my personal growth and peace of mind.",
        weeklyTargetMinutes: 120,
        colour,
      },
    ]);
    setCustomName("");
  };

  const updatePriority = (id: string, updates: Partial<CustomPriority>) => {
    setSelectedPriorities(
      selectedPriorities.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  // Convert for radar preview
  const totalTarget = selectedPriorities.reduce((sum, p) => sum + p.weeklyTargetMinutes, 0);
  const radarItems = selectedPriorities.map((p) => ({
    name: p.name,
    intended: totalTarget > 0 ? p.weeklyTargetMinutes / totalTarget : 0.33,
    actual: totalTarget > 0 ? (p.weeklyTargetMinutes * 0.8) / totalTarget : 0.33,
    colour: p.colour,
  }));

  const handleFinish = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (selectedPriorities.length < 3 || selectedPriorities.length > 5) {
      setErrorMessage("Please select between 3 and 5 priorities to balance your mirror.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setErrorMessage("No active authenticated session found. Please sign in via SMS OTP or Google first.");
        setLoading(false);
        return;
      }

      // 1. Upsert / update public.profiles with onboarding preferences
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { error: profileError } = await db
        .from("profiles")
        .upsert({
          id: user.id,
          reminder_time: reminderTime,
          onboarding_completed: true,
        });

      if (profileError) {
        setErrorMessage(`Could not update profile: ${profileError.message}`);
        setLoading(false);
        return;
      }

      // 2. Prepare priorities payload for public.priorities table
      const prioritiesPayload = selectedPriorities.map((p, index) => ({
        user_id: user.id,
        name: p.name,
        colour: p.colour,
        icon: p.icon || "sparkles",
        why_statement: p.why,
        weekly_target_minutes: p.weeklyTargetMinutes,
        sort_order: index,
        active: true,
      }));

      // Delete existing priorities for this user to avoid stale duplicates on re-onboarding
      await db.from("priorities").delete().eq("user_id", user.id);

      const { error: prioritiesError } = await db
        .from("priorities")
        .insert(prioritiesPayload);

      if (prioritiesError) {
        setErrorMessage(`Could not save priorities: ${prioritiesError.message}`);
        setLoading(false);
        return;
      }

      setSuccessMessage("Your intentions have been preserved. Opening your Mirror...");
      setTimeout(() => {
        router.push("/dashboard");
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred while saving your priorities.";
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#040714] text-slate-100 p-4 sm:p-8 flex justify-center">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="text-xs font-mono uppercase tracking-widest text-violet-400">
            Onboarding · Step 1 of 3
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mt-2">
            Choose what truly matters.
          </h1>
          <p className="text-sm text-slate-400 mt-2 max-w-lg mx-auto">
            Select 3 to 5 core domains. Write why each one anchors you, and define realistic weekly minute targets.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form & Priority configuration */}
          <div className="lg:col-span-7 space-y-6">
            {/* Quick preset selector */}
            <div className="glass-panel rounded-2xl p-5 border border-white/10">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Suggested Priorities (Choose 3–5)
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_OPTIONS.map((opt) => {
                  const isSelected = selectedPriorities.some((p) => p.name === opt.name);
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      onClick={() => handleTogglePreset(opt)}
                      className={`text-xs px-3.5 py-1.5 rounded-full border transition-all ${
                        isSelected
                          ? "bg-violet-600 text-white border-violet-400 shadow-sm"
                          : "bg-white/[0.03] text-slate-300 border-white/10 hover:border-white/25"
                      }`}
                    >
                      {isSelected ? "✓ " : "+ "}
                      {opt.name}
                    </button>
                  );
                })}
              </div>

              {/* Custom Priority creator */}
              <form onSubmit={handleAddCustom} className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Create custom priority (e.g. Photography)..."
                  className="flex-1 rounded-xl bg-white/[0.04] p-2.5 text-xs text-white placeholder-slate-500 border border-white/10 focus:border-violet-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-all"
                >
                  Add
                </button>
              </form>
            </div>

            {/* Configured priorities: Target & Why statement */}
            <div className="space-y-4">
              {selectedPriorities.map((priority, index) => (
                <div
                  key={priority.id}
                  className="glass-panel rounded-2xl p-5 border border-white/10 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: priority.colour }}
                      />
                      <span className="font-semibold text-sm text-white">
                        {index + 1}. {priority.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-slate-400">Weekly Target:</label>
                      <input
                        type="number"
                        min={30}
                        step={15}
                        max={1440}
                        value={priority.weeklyTargetMinutes}
                        onChange={(e) =>
                          updatePriority(priority.id, {
                            weeklyTargetMinutes: Number(e.target.value),
                          })
                        }
                        className="w-20 rounded-lg bg-black/40 px-2 py-1 text-xs text-right font-mono text-cyan-300 border border-white/10 focus:border-violet-400 focus:outline-none"
                      />
                      <span className="text-[11px] text-slate-400">min/wk</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Why does this matter to you? (One sentence)
                    </label>
                    <input
                      type="text"
                      value={priority.why}
                      onChange={(e) => updatePriority(priority.id, { why: e.target.value })}
                      className="w-full rounded-xl bg-white/[0.03] p-2.5 text-xs text-slate-200 border border-white/5 focus:border-violet-400 focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Reminder Preference */}
            <div className="glass-panel rounded-2xl p-5 border border-white/10 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-white">Daily 45-Second Reflection Time</h4>
                <p className="text-[11px] text-slate-400">
                  Preferred evening reminder for your voluntary daily check-in.
                </p>
              </div>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="rounded-xl bg-black/40 px-3 py-2 text-xs font-mono text-white border border-white/10 focus:outline-none"
              />
            </div>
          </div>

          {/* Right Column: Intended Balance Preview & Finish */}
          <div className="lg:col-span-5 sticky top-8 space-y-6">
            <div className="glass-panel rounded-3xl p-6 border border-white/10 text-center">
              <span className="text-xs font-mono uppercase tracking-wider text-teal-400">
                Intended Balance Radar
              </span>
              <p className="text-[11px] text-slate-400 mt-1 mb-2">
                Glowing perimeter represents the life distribution you chose.
              </p>

              <IntentionRadar items={radarItems} score={100} />

              <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-xs text-slate-400">
                <span>Total weekly intention:</span>
                <span className="font-semibold text-white">
                  {Math.round(totalTarget / 60)} hrs {totalTarget % 60} mins
                </span>
              </div>
            </div>

            {/* Error and Success Feedback Alerts */}
            {errorMessage && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4 text-xs text-rose-300 leading-relaxed animate-in fade-in">
                <div className="font-semibold text-rose-200 mb-1">Unable to complete onboarding</div>
                {errorMessage}
                {errorMessage.includes("authenticated session") && (
                  <div className="mt-2 pt-2 border-t border-rose-500/20">
                    <button
                      type="button"
                      onClick={() => router.push("/login")}
                      className="font-semibold text-white underline hover:text-rose-100"
                    >
                      Go to Sign In →
                    </button>
                  </div>
                )}
              </div>
            )}

            {successMessage && (
              <div className="rounded-2xl border border-teal-500/40 bg-teal-950/30 p-4 text-xs text-teal-200 text-center animate-in fade-in">
                ✓ {successMessage}
              </div>
            )}

            <button
              onClick={handleFinish}
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-teal-600 py-4 text-sm font-semibold text-white shadow-xl shadow-violet-600/30 hover:scale-[1.01] hover:shadow-violet-600/50 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? "Preserving your intentions..." : "Finish & Enter Dashboard →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
