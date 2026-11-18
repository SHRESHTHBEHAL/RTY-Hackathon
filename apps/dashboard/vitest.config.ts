import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      { find: /^@\//, replacement: root },
      { find: /^server-only$/, replacement: `${root}test/server-only-stub.ts` },
    ],
  },
  test: {
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "components/**/*.test.tsx", "test/**/*.test.ts", "test/**/*.test.tsx"],
    environment: "node",
  },
});
