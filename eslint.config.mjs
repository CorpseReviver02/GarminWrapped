// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tsPlugin from "@typescript-eslint/eslint-plugin";          // NEW
import unusedImports from "eslint-plugin-unused-imports";         // NEW

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  // Keep ignores in-config for flat ESLint
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts"
  ]),

  // Extra rules that prevent the TS issues you saw on CI
  {
    plugins: {
      "@typescript-eslint": tsPlugin,
      "unused-imports": unusedImports
    },
    rules: {
      // Warn on risky truthy checks like `x && x.prop`
      "@typescript-eslint/no-unnecessary-condition": "warn",

      // Encourage `as`-style tuple casts in guarded branches
      "@typescript-eslint/consistent-type-assertions": [
        "warn",
        { assertionStyle: "as", objectLiteralTypeAssertions: "allow" }
      ],

      // Clean dead imports early (CI will fail)
      "unused-imports/no-unused-imports": "error",

      // Catches accidental arithmetic in boolean contexts
      "no-constant-binary-expression": "error"
    }
  }
]);
