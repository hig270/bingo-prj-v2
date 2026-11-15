// @ts-check
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "**/coverage/",
    "**/.wrangler/",
    "**/*.gen.ts",
    "**/worker-configuration.d.ts",
    "**/*.module.scss.d.ts",
  ]),

  js.configs.recommended,

  // 型情報を使う厳格なルール（型安全の方針: decisions.md）
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // switch の網羅性を型でチェックする。ユニオン型では default で逃げることを許さない
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        {
          considerDefaultExhaustiveForUnions: false,
          requireDefaultForNonUnion: true,
        },
      ],
      // if の条件などに、boolean 以外（null になりうる文字列など）をそのまま使わせない
      "@typescript-eslint/strict-boolean-expressions": "error",
      // 使っていない変数は _ で始めれば許可する
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // React の決まり（フックの呼び方、描画中に値を書き換えないなど）。
  // React Compiler はこの決まりを前提に最適化するので、破っている箇所をリントで見つける
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
  },

  // 設定ファイルなどの .js は型情報を使わない
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
