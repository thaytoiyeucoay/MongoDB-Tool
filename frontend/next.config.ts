import type { NextConfig } from "next";

// Explicitly set Turbopack root to this frontend app to silence workspace root warnings
const nextConfig: NextConfig & { turbopack?: { root?: string } } = {
  turbopack: {
    // __dirname points to the directory of this next.config.ts (i.e., ./frontend)
    root: __dirname,
  },
};

export default nextConfig;
