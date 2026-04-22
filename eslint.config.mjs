import next from "eslint-config-next";

// ── Server-only boundary protection ────────────────────────────────────────
// Matches the rule used in freela/ so refactors stay parallel.
const SERVER_ONLY_IMPORTS = [
  { name: "@/lib/prisma", message: "Server-only." },
  { name: "@/lib/secret-crypto", message: "Server-only." },
  { name: "@/lib/unsubscribe-token", message: "Server-only." },
  { name: "@/lib/desktop-jwt", message: "Server-only." },
  { name: "@/lib/desktop-auth", message: "Server-only." },
  { name: "@/lib/desktop-admin-auth", message: "Server-only." },
  { name: "@/lib/rate-limit", message: "Server-only." },
  { name: "@/lib/campaign-queue", message: "Server-only." },
  { name: "@/lib/campaign-worker", message: "Server-only." },
  { name: "@/lib/campaign-scheduler", message: "Server-only." },
  { name: "@/lib/mailer-env", message: "Server-only." },
  { name: "server-only", message: "Pointless in a client file — move the import upstream." },
];

export default [
  {
    ignores: ["node_modules/**", ".next/**", "coverage/**"],
  },
  ...next,
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { paths: SERVER_ONLY_IMPORTS }],
    },
  },
];
