# freela-mailer

Standalone email-campaign SaaS extracted from the freela.ge monorepo. Serves:

- `mailer.freela.ge` — canonical mailer UI + API
- forever-host compat endpoints under `freela.ge` (reverse-proxied from freela)

## Relationship to `freela/`

- **No source imports** cross the project boundary in either direction.
- Shared history is preserved in `freela/docs/`; day-to-day changes ship
  independently.
- Freela's Caddy reverse-proxies a frozen list of legacy paths (tracking
  pixels, unsubscribe, desktop client endpoints) to this app so historical
  emails and deployed desktop binaries keep working. The allowlist lives in
  `freela/deploy/Caddyfile`.

## Layout

```
freela-mailer/
├── prisma/              Prisma schema + init baseline migration
├── src/
│   ├── app/
│   │   ├── api/         Mailer API routes
│   │   ├── mailer/      Mailer UI (admin + user)
│   │   ├── layout.tsx   Isolated root layout (no NextAuth, no GA)
│   │   └── page.tsx     → redirects to /mailer
│   ├── components/ui/   Shared UI primitives (forked from freela)
│   ├── i18n/            next-intl setup
│   └── lib/             Mailer libs + forked shared utilities
├── messages/            i18n messages (en, ka, ru; mailer namespace only)
├── scripts/
│   ├── mailer-worker.mjs  BullMQ worker + scheduler entrypoint
│   ├── rotate-smtp-crypto.mjs  One-off SMTP re-encrypt migration
│   └── sql/             Phase-4 audit/scrub SQL
├── deploy/
│   ├── docker-compose.yml  Standalone stack (app + worker + db + redis)
│   └── Caddyfile           mailer.freela.ge vhost
└── Dockerfile
```

## Run locally

```sh
cp .env.example .env     # fill in secrets + DB URL
npm ci
npx prisma migrate deploy
npm run dev              # -p 3100 (to not clash with freela on 3000)
```

## Worker

```sh
npm run worker           # tsx scripts/mailer-worker.mjs
```

The worker exposes `/healthz` + `/ready` on `WORKER_HEALTH_PORT` (default 3001).

## SMTP crypto rotation

One-time, during Phase 4 bring-up of this isolated stack:

```sh
npm run migrate:smtp-crypto:dry    # dry run, reports counts
npm run migrate:smtp-crypto        # actually re-encrypt
```

See `scripts/rotate-smtp-crypto.mjs` for the workflow.

## Cutover

Cutover is orchestrated from `freela/docs/phase4-cutover-runbook.md`. Do not
start running this stack in production without completing the runbook's
pre-flight checks.

## CI/CD (Independent from `freela`)

This repository has its own GitHub Actions pipelines:

- `Mailer CI` — lint + tests + build on every push/PR.
- `Mailer Deploy` — deploys to production on successful `main` CI (or manual run).

Add these repository secrets in `atinomeri/freela-mailer`:

- `MAILER_VPS_HOST` (example: `76.13.144.121`)
- `MAILER_VPS_USER` (example: `root`)
- `MAILER_VPS_SSH_PORT` (example: `22`)
- `MAILER_VPS_APP_DIR` (example: `/root/freela-mailer`)
- `MAILER_VPS_SSH_PRIVATE_KEY` (private key content for deploy user)
- Optional: `MAILER_VPS_HOST_KEY` (pinned host key line for `known_hosts`)
- Optional: `MAILER_DEPLOY_HEALTHCHECK_URL` (example: `https://mailer.freela.ge/api/health`)

Server bootstrap (one-time):

```sh
git clone git@github.com:atinomeri/freela-mailer.git /root/freela-mailer
cd /root/freela-mailer/deploy
cp ../.env.example .env
# fill real values in .env
docker compose -p freela-mailer -f docker-compose.yml up -d --build
```
