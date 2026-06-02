import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['gray-matter'],
  transpilePackages: ['three'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
