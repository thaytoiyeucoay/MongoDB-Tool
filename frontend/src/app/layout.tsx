import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { HeaderNav } from "@/components/HeaderNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MongoDB Tool",
  description: "MongoDB management UI powered by Next.js + FastAPI backend",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="sticky top-0 z-50 border-b border-white/50 bg-white/70 backdrop-blur-xl">
          <div className="relative">
            <div className="absolute inset-x-0 -top-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-70 header-gradient" />
            <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
              <div className="font-semibold text-gray-800 tracking-tight">MongoDB Tool</div>
              <HeaderNav />
            </div>
          </div>
        </header>
        {children}
        <footer className="border-t bg-white mt-16">
          <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-600">
            <div>© {new Date().getFullYear()} MongoDB Tool</div>
            <nav className="space-x-4">
              <a className="hover:underline" href="/management">Management</a>
              <a className="hover:underline" href="/sync">Sync</a>
              <a className="hover:underline" href="/guide">Guide</a>
              <a className="hover:underline" href="/contact">Contact</a>
            </nav>
          </div>
        </footer>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
