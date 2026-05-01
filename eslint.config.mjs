import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts directory
    "scripts/**",
  ]),
  // Project-specific rule overrides
  {
    rules: {
      // Allow `any` types — project uses Prisma dynamic queries and NextAuth session casting
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow unused variables in catch clauses (common pattern)
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "caughtErrors": "none" }],
      // React hooks — fetch + setState in effects is the standard Next.js data fetching pattern
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
