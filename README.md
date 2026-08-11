# Odyssey Monorepo

Odyssey is an intelligent portfolio operating system for self-managing residential landlords. It serves as a refined private portfolio command center that is minimal, modern, calm, premium, and decision-oriented.

## Architecture & Layout

The project is structured as a TypeScript monorepo using **pnpm workspaces** and **Turborepo** for parallel build and execution execution.

<!-- Please work -->

```
├── apps
│   ├── api          # Fastify REST API, OpenAPI docs, domain-services
│   ├── worker       # BullMQ background worker (scheduled lease-expiry reviews)
│   ├── web          # Next.js 14 Web App (Tailwind CSS, shadcn components, React Query)
│   └── mobile       # Expo + Expo Router app (scaffold only)
├── packages
│   ├── db           # Drizzle ORM schemas, migration configurations, and seed script
│   ├── validation   # Shared Zod validation schemas and types
│   └── tsconfig     # Shared strict compiler settings
├── docs             # Domain specifications, database diagrams, API specs, security matrix
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

Detailed technical specs are available in the `docs` directory:

- [Product Spec](file:///Users/jake/Desktop/Rich%20Real%20Estate/docs/product-spec.md)
- [Domain Models](file:///Users/jake/Desktop/Rich%20Real%20Estate/docs/domain-model.md)
- [API Contracts](file:///Users/jake/Desktop/Rich%20Real%20Estate/docs/api-contracts.md)
- [Security Matrix](file:///Users/jake/Desktop/Rich%20Real%20Estate/docs/security.md)
- [Railway Deployment Notes](file:///Users/jake/Desktop/Rich%20Real%20Estate/docs/railway-notes.md)

---

## Local Development Setup

### 1. Requirements

Ensure you have Node.js (v18+), global `pnpm`, and local PostgreSQL and Redis servers installed.

### 2. Set Environment Variables

Copy `.env.example` to `.env` in the root:

```bash
cp .env.example .env
```

### 3. Spin Up Infrastructure

Launch local PostgreSQL (port 5432) and Redis (port 6379).

### 4. Install Monorepo Dependencies

```bash
pnpm install
```

### 5. Build Workspace Packages

Build shared packages (`packages/validation` and `packages/db`) so they are available to apps:

```bash
pnpm build
```

### 6. Database Migrations & Seeding

Push the database schema directly to PostgreSQL and populate with high-fidelity seed data:

```bash
# Generate and run Drizzle migrations
pnpm --filter @hearthlane/db db:push

# Run seed script
pnpm --filter @hearthlane/db db:seed
```

### 7. Run Local Development Servers

Launch Fastify, Next.js, and the BullMQ worker simultaneously:

```bash
pnpm dev
```

- Web Application: `http://localhost:3000`
- REST API Server: `http://localhost:4000`
- Swagger Documentation: `http://localhost:4000/docs`

---

## Developer Demo Credentials

A local selector is available on the `/login` screen. Select any user to login without passwords:

- **Owner-Manager**: `owner@odyssey.com` (password: `password123`)
- **Property Manager**: `manager@odyssey.com` (password: `password123`)
- **Maintenance Lead**: `maintenance@odyssey.com` (password: `password123`)
- **Investor (Read-only)**: `readonly@odyssey.com` (password: `password123`)

---

## Integrating Production Services

### 1. Clerk Authentication

To transition from local dev JWT auth to Clerk:

- Install `@clerk/nextjs` in `apps/web` and `@clerk/fastify` in `apps/api`.
- Swap the custom context provider in `apps/web/src/context/auth-context.tsx` with Clerk's `<ClerkProvider>`.
- Configure `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `.env`.

### 2. S3 Compatible Attachments

- In production, specify AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `AWS_BUCKET_NAME`) in the environment.
- Swap the local attachment mock in `apps/api/src/services` with `@aws-sdk/client-s3` upload configurations.

### 3. Real AI Lease Summarization & Chat

- In the `apps/api/src/services/ai.ts` module, replace the `MockAIProvider` with an OpenAI / Anthropic SDK configuration.
- Feed the prompt texts to retrieve structured JSON outputs matching the `AIPromptResponse` interface.

# odyssey
