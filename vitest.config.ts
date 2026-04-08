import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", ".tmp-dist/**", ".tmp-dist-verify/**", "node_modules/**"],
  },
});
