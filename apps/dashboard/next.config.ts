import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // Lets several dev servers run side by side, each with its own build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
