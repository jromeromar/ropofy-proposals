import { defineConfig } from "vitest/config";

export default defineConfig({
  // Use the automatic JSX runtime so components render without a React import.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
