import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Hosts allowed to load dev-server resources.
   *
   * Next blocks cross-origin access to /_next/static, the HMR socket and dev
   * fonts unless the requesting host is listed. Reaching the app as anything
   * other than the host it thinks it is — 127.0.0.1 instead of localhost, or a
   * phone on the LAN hitting the machine's IP — otherwise 403s the JavaScript
   * bundle. The page still renders, because the HTML is server-rendered, which
   * makes it look like the app works while nothing interactive does.
   *
   * Development only; it has no effect on a production build.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost", "[::1]"],

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
