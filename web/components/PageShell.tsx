import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

// Bricolage Grotesque for the wordmark, headings and big numbers;
// Figtree for everything else.
const fonts = {
  "--font-display": "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif",
  fontFamily: "'Figtree', ui-sans-serif, system-ui, sans-serif",
} as CSSProperties;

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
] as const;

type PageShellProps = {
  current: (typeof NAV)[number]["href"];
  children: ReactNode;
};

// Header, navigation and page background shared by every page.
export default function PageShell({ current, children }: PageShellProps) {
  return (
    <main className="min-h-screen bg-[#13122B] text-[#F1F0FA] [color-scheme:dark]" style={fonts}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600;700&display=swap"
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h1 className="flex items-center gap-2 text-4xl font-extrabold tracking-tight [font-family:var(--font-display)]">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-8 w-8 text-[#8B7CFF]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="10.5" width="16" height="11" rx="3" />
                <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
                <path d="M9 16l2 2 4-4" />
              </svg>
              LockedIn
            </h1>
            <p className="mt-2 text-[#A9A7C9]">Your AI-powered health and fitness tracker</p>
          </div>

          <nav aria-label="Main" className="flex gap-1 rounded-xl bg-[#1B1A36] p-1 ring-1 ring-[#2E2B57]">
            {NAV.map((item) => {
              const active = item.href === current;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#8B7CFF] ${
                    active ? "bg-[#8B7CFF] text-[#13122B]" : "text-[#B9B6DA] hover:bg-[#23204A]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        {children}
      </div>
    </main>
  );
}