"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/management", label: "Management" },
  { href: "/sync", label: "Sync" },
  { href: "/guide", label: "Guide" },
  { href: "/contact", label: "Contact" },
];

export function HeaderNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-2 text-sm">
      {links.map((l) => {
        const active = pathname?.startsWith(l.href);
        const icon = l.href === "/management" ? (
          <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/></svg>
        ) : l.href === "/sync" ? (
          <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 22v-6h6"/><path d="M21 8a9 9 0 0 0-15.5-6.5M3 16a9 9 0 0 0 15.5 6.5"/></svg>
        ) : l.href === "/guide" ? (
          <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4v15.5"/><path d="M6.5 17V4H20v13"/></svg>
        ) : (
          <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1 1.9-5.4"/><path d="M22 4l-10 10"/></svg>
        );
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              `relative px-3 py-1.5 rounded-full transition-all duration-200 ` +
              (active
                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md"
                : "hover:bg-gray-100 text-gray-700")
            }
          >
            <span className="inline-flex items-center">
              {icon}
              {l.label}
            </span>
            {active && (
              <span className="absolute inset-0 rounded-full ring-2 ring-blue-500/20" />
            )}
          </Link>
        );}
      )}
    </nav>
  );
}
