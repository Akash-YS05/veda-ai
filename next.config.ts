import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARNING: This allows production builds to successfully complete even if
    // there are TypeScript errors. We recommend removing this during development.
    ignoreBuildErrors: true,
  },
  // Add path aliases support
  async redirects() {
    return [];
  },
};

export default nextConfig;
