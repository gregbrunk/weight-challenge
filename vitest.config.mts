import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

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
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
