import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#040714] text-slate-100 flex flex-col justify-between selection:bg-violet-600 selection:text-white">
      {/* Background ambient cosmic glow */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-violet-950/25 blur-[160px]" />
        <div className="absolute bottom-1/4 right-1/4 h-[450px] w-[450px] rounded-full bg-teal-950/20 blur-[140px]" />
        <div className="absolute top-1/3 left-1/6 h-[350px] w-[350px] rounded-full bg-blue-950/25 blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:40px_40px] opacity-40" />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full border-b border-white/[0.06] backdrop-blur-md bg-[#040714]/60">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 via-blue-500/10 to-teal-500/20 border border-white/10">
              <div className="h-3 w-3 rounded-full bg-gradient-to-tr from-violet-400 to-teal-300 shadow-[0_0_12px_rgba(139,92,246,0.8)]" />
            </div>
            <span className="font-semibold tracking-wider text-lg text-white">Mirror</span>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-violet-600/30 hover:from-violet-500 hover:to-indigo-500 transition-all"
            >
              Begin Reflecting
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-16 sm:py-24 text-center">
        {/* Subtle pill badge */}
        <div className="glass-panel inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-violet-300 mb-8 border border-violet-500/30">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
          <span>Private life-alignment & time reflection</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.08]">
          See your life{" "}
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-teal-300 to-blue-400">
            more clearly.
          </span>
        </h1>

        {/* Core Message */}
        <p className="max-w-2xl text-base sm:text-xl text-slate-300/90 leading-relaxed mb-4">
          Choose what matters. Reflect honestly. See your future more clearly.
        </p>

        {/* Boundary clarification */}
        <p className="max-w-xl text-xs sm:text-sm text-slate-400 leading-relaxed mb-10">
          Not therapy, a medical app, or automatic screen monitoring. Mirror reflects only the self-directed time you voluntarily log, with a clear next action rather than guilt.
        </p>

        {/* Primary CTA Button */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/login"
            className="group relative inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-violet-600 via-indigo-600 to-teal-600 px-8 py-4 text-base font-semibold text-white shadow-xl shadow-violet-600/30 hover:scale-[1.02] hover:shadow-violet-600/50 transition-all"
          >
            <span>Begin Reflecting</span>
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-6 py-4 text-sm font-medium text-slate-300 hover:bg-white/[0.08] hover:text-white transition-all"
          >
            Explore Interactive Demo
          </Link>
        </div>

        {/* 3 Step Breakdown */}
        <div className="mt-20 grid w-full grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {/* Step 1 */}
          <div className="glass-panel rounded-2xl p-6 border border-white/[0.08] relative overflow-hidden">
            <div className="text-xs font-mono text-violet-400 mb-2">01 / INTENTION</div>
            <h3 className="text-lg font-bold text-white mb-2">Choose Priorities & Whys</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Pick 3–5 focus areas—guitar, study, health, deep reading—and articulate the exact reason each domain anchors your identity.
            </p>
          </div>

          {/* Step 2 */}
          <div className="glass-panel rounded-2xl p-6 border border-white/[0.08] relative overflow-hidden">
            <div className="text-xs font-mono text-cyan-400 mb-2">02 / REFLECTION</div>
            <h3 className="text-lg font-bold text-white mb-2">45-Second Daily Check-in</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Log self-directed minutes, unplanned time, sleep, and mood. Watch your central frosted reflection clarify as reality aligns with intention.
            </p>
          </div>

          {/* Step 3 */}
          <div className="glass-panel rounded-2xl p-6 border border-white/[0.08] relative overflow-hidden">
            <div className="text-xs font-mono text-teal-400 mb-2">03 / FUTURE LAB</div>
            <h3 className="text-lg font-bold text-white mb-2">One 7-Day Experiment</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Simulate moving 20 minutes a day from scrolling to your craft (+122 hours/year). Commit to one repeatable week without overwhelming change.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-white/[0.05] py-6 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 Mirror. Voluntary reflection engine.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Supabase Auth & PostgreSQL</span>
            <span>•</span>
            <span>Google Sheets Sync</span>
            <span>•</span>
            <span>Zero automatic tracking</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
