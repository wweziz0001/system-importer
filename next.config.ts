import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    largePageDataBytes: 1024 * 1024 * 1024, // 1GB
  },
};

export default nextConfig;
