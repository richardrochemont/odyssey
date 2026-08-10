# Railway Deployment Notes

Odyssey's backend (API + worker + Postgres + Redis) deploys to Railway. The web frontend deploys
separately to Vercel (see repo root `vercel.json` history / README) — it is **not** deployed on
Railway; `NEXT_PUBLIC_API_URL` on Vercel must point at the API service's public Railway URL.

This is a pnpm workspace monorepo (`pnpm-workspace.yaml`, `turbo.json`). `apps/api` and
`apps/worker` both depend on `@hearthlane/db` and `@hearthlane/validation` at runtime (compiled
`dist/` output, resolved via package.json `main`/`types`). **Building a service with a plain
`pnpm --filter <pkg> run build` does NOT build those workspace dependencies first** — the build
will fail (or silently reuse stale `dist/` output) unless dependencies are built in order. Use
`turbo run build --filter=<pkg>...` (the trailing `...` includes upstream workspace dependencies)
so Turborepo's dependency graph (`turbo.json` → `build.dependsOn: ["^build"]`) builds
`@hearthlane/db` and `@hearthlane/validation` before the service that needs them.

---

## 1. Shared Infrastructure

Provision these as Railway-managed plugins in the same Railway project (not external databases),
so services can reach them over Railway's private network:

- **Railway PostgreSQL** — exposes `DATABASE_URL` (private/internal) and `DATABASE_PUBLIC_URL`
  (public, for connecting from outside Railway, e.g. running a one-off migration from your laptop).
- **Railway Redis** — exposes `REDIS_URL` (private/internal) for BullMQ.

Reference these from other services using Railway's variable-reference syntax
(`${{ Postgres.DATABASE_URL }}`, `${{ Redis.REDIS_URL }}`) rather than copy-pasting the value —
that way rotations/redeploys stay in sync automatically. Internal (`.railway.internal`) URLs never
leave Railway's network and do not need SSL; only use the public URL for external/local access.

---

## 2. API Service (`apps/api`)

- **Service Type**: Web Service (needs a public URL — the Vercel frontend calls it)
- **Root Directory**: `/` (repo root — required so the build can see the whole workspace)
- **Install Command**: `pnpm install`
- **Build Command**: `pnpm turbo run build --filter=@hearthlane/api...`
- **Start Command**: `pnpm --filter @hearthlane/api run start`
- **Healthcheck Path**: `/health` (liveness). `/health/db` also exists and verifies the database
  connection — useful for manual checks, but keep the configured Railway healthcheck on `/health`
  so a transient DB blip doesn't restart-loop the service.
- **Environment Variables**:
  - `PORT`: Railway sets/maps this automatically — do not hardcode.
  - `DATABASE_URL`: `${{ Postgres.DATABASE_URL }}`
  - `REDIS_URL`: `${{ Redis.REDIS_URL }}` (not currently consumed by the API — no code path
    enqueues BullMQ jobs yet — but set it now so it's ready when one is added)
  - `JWT_SECRET`: a real random secret (`openssl rand -hex 32`). **Required** — without it the API
    falls back to a hardcoded secret checked into this repo, and it will log a security warning on
    boot in production.
  - `NODE_ENV`: `production`
  - `CORS_ORIGIN`: the exact Vercel production URL (e.g. `https://odyssey.vercel.app`), comma
    -separated if there's more than one (preview + production). If unset, the API reflects any
    origin — that's what makes the current deploy technically work cross-origin, but it should be
    locked down once the production frontend URL is stable.
  - `ENABLE_DEV_AUTH_DIRECTORY`: leave unset/`true` for now (this is the only working login flow —
    see the Authentication section below). Set to `false` once real tenant/financial data lives in
    this environment.

---

## 3. BullMQ Worker Service (`apps/worker`)

- **Service Type**: Private Service / Worker (no public networking needed — it only consumes jobs)
- **Root Directory**: `/`
- **Install Command**: `pnpm install`
- **Build Command**: `pnpm turbo run build --filter=@hearthlane/worker...`
- **Start Command**: `pnpm --filter @hearthlane/worker run start`
- **Environment Variables**:
  - `DATABASE_URL`: `${{ Postgres.DATABASE_URL }}`
  - `REDIS_URL`: `${{ Redis.REDIS_URL }}`

Note: nothing in the codebase currently *enqueues* the `lease-expiry-check` job the worker listens
for — there's no scheduler/cron producer yet. The worker will boot and idle correctly, but won't do
anything until a job is enqueued (manually, or via a future Railway Cron Job / scheduled producer).

---

## 4. Web Frontend (`apps/web`) — deployed on Vercel, not Railway

Set on the Vercel project (Project Settings → Environment Variables):

- `NEXT_PUBLIC_API_URL`: the API service's **public** Railway URL
  (e.g. `https://odyssey-api-production.up.railway.app`). This is inlined into the client bundle
  at build time — if it's missing when Vercel builds, every fetch call falls back to
  `http://localhost:4000`, which the browser can't reach. This must be set *before* triggering a
  build, and any change requires a redeploy to take effect.

---

## 5. Environment variables that are NOT currently required

`.env.example` lists several integrations that are **not wired into any code path** yet — don't
spend time provisioning them:

- `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — `@clerk/nextjs` isn't a dependency
  anywhere in `apps/web`. The login page's Clerk mention is UI copy only.
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `AWS_BUCKET_NAME` /
  `AWS_S3_ENDPOINT` — the Documents page's "S3 storage" is a UI placeholder `alert()`, not a real
  upload path.
- `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` — not initialized anywhere in `apps/api` or `apps/web`.
- No OpenAI/Anthropic key is needed — `/ai/*` routes are served by a fully deterministic mock
  provider (`apps/api/src/services/ai.ts`), no external AI API is called.

---

## 6. Authentication — current state

There is no production identity provider wired up. The login page's "Local Developer Auth
selector" (`GET /auth/users` + `POST /auth/login`, `password123` for every seeded user, SHA-256
unsalted password hashing) is the **only** working login path in every environment, including
production. `GET /auth/users` requires no authentication and returns every user's name, email, and
role. Locking this down (env flag added, defaults to current behavior — see `ENABLE_DEV_AUTH_DIRECTORY`
above) is scoped separately from getting a real auth provider in place; don't flip that flag off
until there's a replacement login flow, or production login breaks entirely.

---

## 7. Database Setup (Migrations & Seeding)

- **Never run `db:push` against production.** `drizzle-kit push` diffs the live database and
  applies changes directly with no reviewable artifact — safe for local prototyping, not safe once
  real data exists.
- **Safe production flow**: generate migration SQL locally (already done — see
  `packages/db/migrations/0000_classy_freak.sql`, committed to the repo), review it, then apply it
  with `drizzle-kit migrate`, which tracks what's already been applied and only runs what's new.
  ```
  pnpm --filter @hearthlane/db run db:migrate
  ```
  Run this with `DATABASE_URL` pointed at the target database — either as a Railway one-off command
  (`railway run --service <api-service> pnpm --filter @hearthlane/db run db:migrate`) or locally
  against `DATABASE_PUBLIC_URL` while iterating.
- **Do not run `db:seed` against production.** It unconditionally deletes all rows in every table
  before inserting fictional demo data (Oakridge Manor, Maple Heights, etc.) — this is a
  local/staging-only convenience script, never something to run against real tenant data.
