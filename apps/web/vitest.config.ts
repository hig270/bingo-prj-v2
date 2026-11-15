import { defineConfig } from "vitest/config";

// テストは vite.config.ts（Worker を動かすプラグインなど）を使わず、ここだけの設定で動かす
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
