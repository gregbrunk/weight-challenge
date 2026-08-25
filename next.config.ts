import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Progress photos arrive through a server action. The browser downsizes
      // them to roughly 200–400KB first, but the default 1MB ceiling leaves no
      // room for an unusually large one, and the failure mode is an opaque
      // request error rather than a message anyone could act on.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
