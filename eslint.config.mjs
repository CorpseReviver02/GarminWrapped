// eslint.config.mjs  (typed parsing + silence false-positive warnings)
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import unusedImports from "eslint-plugin-unused-imports";

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts"
  ]),

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
        // If Vercel can’t resolve, switch to:
        // project: ["./tsconfig.json"],
        // tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "unused-imports": unusedImports
    },
    rules: {
      // We rely on explicit guards; this rule was generating CI warnings
      "@typescript-eslint/no-unnecessary-condition": "off",

      "@typescript-eslint/consistent-type-assertions": [
        "warn",
        { assertionStyle: "as", objectLiteralTypeAssertions: "allow" }
      ],
      "unused-imports/no-unused-imports": "error",
      "no-constant-binary-expression": "error",
      // keep default: no-explicit-any -> we removed all `any` above
    }
  }
]);
