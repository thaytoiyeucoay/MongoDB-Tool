import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

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
        <header className="border-b bg-white">
          <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
            <div className="font-semibold">MongoDB Tool</div>
            <nav className="text-sm">
              <a className="hover:underline" href="/management">Management</a>
            </nav>
          </div>
        </header>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
