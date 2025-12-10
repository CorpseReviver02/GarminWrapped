// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import unusedImports from "eslint-plugin-unused-imports";

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  // Ignore build artifacts
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts"
  ]),

  // Enable **typed** linting only for TS files (fixes your error)
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // EITHER: auto-detect tsconfig(s) (recommended with ESLint 9 + TS-ESLint 8)
        projectService: true,
        tsconfigRootDir: import.meta.dirname

        // OR: pin explicit project(s) if preferred
        // project: ["./tsconfig.json"],
        // tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "unused-imports": unusedImports
    },
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/consistent-type-assertions": [
        "warn",
        { assertionStyle: "as", objectLiteralTypeAssertions: "allow" }
      ],
      "unused-imports/no-unused-imports": "error",
      "no-constant-binary-expression": "error"
    }
  }
]);
