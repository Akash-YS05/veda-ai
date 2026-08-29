import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // typescript: {
  //   // !! WARNING: This allows production builds to successfully complete even if
  //   // there are TypeScript errors. We recommend removing this during development.
  //   ignoreBuildErrors: true,
  // },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias.canvas = false;
      config.resolve.alias.encoding = false;
    };
    return config;
  },
  // Add path aliases support
  async redirects() {
    return [];
  },
};

export default nextConfig;
