import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev-only floating badge so it never overlaps the sidebar meter.
  devIndicators: false,
};

export default nextConfig;
