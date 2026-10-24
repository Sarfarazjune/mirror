import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mirror — Choose what matters. Reflect honestly.",
  description: "A private life-alignment app comparing what you say matters with how you spend your self-directed time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-[#040714] text-slate-100 antialiased selection:bg-violet-600 selection:text-white">
      <body className="min-h-full flex flex-col font-sans bg-[#040714] text-slate-100">
        {children}
      </body>
    </html>
  );
}
