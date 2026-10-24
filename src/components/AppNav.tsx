"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppNav({ isDemoMode, onToggleDemo }: { isDemoMode?: boolean; onToggleDemo?: () => void }) {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", label: "Mirror" },
    { href: "/check-in", label: "Check-in" },
    { href: "/future-lab", label: "Future Lab" },
    { href: "/weekly-review", label: "Review" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#040714]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Logo / Title */}
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 via-blue-500/10 to-teal-500/20 border border-white/10 group-hover:border-violet-400/50 transition-colors">
            <div className="h-3 w-3 rounded-full bg-gradient-to-tr from-violet-400 to-teal-300 shadow-[0_0_12px_rgba(139,92,246,0.8)]" />
          </div>
          <span className="font-semibold tracking-wider text-base text-white group-hover:text-violet-200 transition-colors">
            Mirror
          </span>
        </Link>

        {/* Navigation links */}
        <nav className="hidden md:flex items-center gap-1 sm:gap-2">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/[0.08] text-white border border-white/10 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Demo mode badge & Mobile status */}
        <div className="flex items-center gap-2">
          {onToggleDemo && (
            <button
              onClick={onToggleDemo}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                isDemoMode
                  ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                  : "bg-white/[0.03] text-slate-400 border-white/10 hover:border-white/20"
              }`}
              title="Toggle Alex sample week demo data"
            >
              {isDemoMode ? "★ Sample Week Active" : "Load Sample Week"}
            </button>
          )}

          <Link
            href="/check-in"
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white shadow"
            title="Check In"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
