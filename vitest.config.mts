import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    // Node by default; component tests opt into happy-dom with a docblock.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      // fileURLToPath, not URL.pathname: this project's path contains spaces,
      // and pathname leaves them percent-encoded, which resolves to nothing.
      "@": fromRoot("./src"),

      // server-only ships two builds: an empty one for server contexts and one
      // that throws, chosen by the "react-server" export condition. Vitest
      // resolves the throwing variant, which would fail every suite that
      // touches a guarded module. The guard exists to catch client components
      // at build time, not to break the test runner.
      "server-only": fromRoot("./node_modules/server-only/empty.js"),
    },
  },
});
