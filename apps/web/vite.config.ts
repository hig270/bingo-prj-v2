import { cloudflare } from "@cloudflare/vite-plugin";
import babel from "@rolldown/plugin-babel";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // src/routes のファイルから routeTree.gen.ts を作る。画面ごとにコードを分割する
    // （react より前に置く必要がある）。CSS Modules の型ファイル（*.d.ts）は画面ではないので読み飛ばす
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: String.raw`\.d\.ts$`,
    }),
    react(),
    // React Compiler（安定版の Babel 経由。Rust 版は 2026-11 時点で実験的）
    babel({ presets: [reactCompilerPreset()] }),
    // サーバー（apps/server）の Worker を Vite の開発サーバーの中で動かす。
    // どの URL を Worker に回すかは wrangler.jsonc の assets の設定に従う（本番と同じ）
    cloudflare({ configPath: "../server/wrangler.jsonc" }),
  ],
});
