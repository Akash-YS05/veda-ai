import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
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
