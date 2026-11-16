import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "@near-js/accounts",
    "@near-js/crypto",
    "@near-js/providers",
    "@superbridge/sdk",
    "bufferutil",
    "utf-8-validate",
  ],
  webpack: (config, { isServer, dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/.git/**",
          "**/node_modules/**",
          "**/.agents/**",
          "**/.playwright-mcp/**",
          "**/.next/**",
          "**/supabase/.temp/**",
        ],
      };
    }

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        bufferutil: false,
        "utf-8-validate": false,
      };
    }
    return config;
  },
};

export default nextConfig;
