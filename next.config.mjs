import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

// ── Path-mount configuration (iii — assetPrefix only, no basePath) ────────
//
// freela.ge fronts the mailer app under /mailer/* while the standalone
// freela-mailer container still believes it runs at root. Two pieces glue
// them together:
//
//   1. assetPrefix="/_mailer-next" — every `<link>`, `<script>` and Image
//      src that Next.js renders now points at `/_mailer-next/_next/...`
//      instead of `/_next/...`. freela.ge's Caddy catches this prefix and
//      rewrites it back to `/_next/*` against the mailer upstream. Freela
//      itself is free to keep using its own `/_next/*` without collision.
//
//   2. rewrites — when Caddy forwards `/mailer/api/desktop/admin/*` to the
//      mailer app, the app must route that into the existing handler tree
//      under `/api/desktop/admin/*`. The block below makes that mapping
//      transparent. UI pages under `/mailer/*` are already physically
//      located at `src/app/mailer/*`, so they need no rewrite.
//
// This mount is intentionally temporary. Subdomain cutover (Phase 5) drops
// assetPrefix and removes these rewrites; see docs/phase4-cutover-runbook.md.
const MAILER_ASSET_PREFIX = "/_mailer-next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  typescript: {
    // Temporary: allows production image build while we finish pruning
    // non-mailer type references inherited from the monolith.
    ignoreBuildErrors: true,
  },
  // Applied in prod only. Dev keeps bare `/_next/*` so `next dev` on :3100
  // works without Caddy (local-only navigation via /mailer/* when mounted).
  assetPrefix: process.env.NODE_ENV === "production" ? MAILER_ASSET_PREFIX : undefined,

  async rewrites() {
    return {
      beforeFiles: [
        // When freela.ge proxies `/mailer/api/*` through the `/mailer/*`
        // location, the mailer app sees the full path. Strip the `/mailer`
        // prefix so the existing API handlers pick the request up.
        {
          source: "/mailer/api/:path*",
          destination: "/api/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },

  async headers() {
    const isProd = process.env.NODE_ENV === "production";

    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" }
    ];

    const prodOnly = isProd
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains"
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline'",
              "connect-src 'self' https://*.ingest.sentry.io",
              "upgrade-insecure-requests"
            ].join("; ")
          }
        ]
      : [];

    return [
      {
        source: "/:path*",
        headers: [...base, ...prodOnly]
      }
    ];
  }
};

export default withNextIntl(nextConfig);
