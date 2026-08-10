# Railway Deployment Notes

Railway is an excellent option for deploying the Hearthlane stack. Since Hearthlane is structured as a monorepo, you can provision three separate Railway services pointing to the same repository, using start commands to segment them.

## 1. Shared Infrastructure

First, provision these plugins in your Railway project dashboard:

- **Railway PostgreSQL**: Copy the generated `DATABASE_URL` for the database connection.
- **Railway Redis**: Copy the generated `REDIS_URL` for BullMQ.

---

## 2. API Service (`apps/api`)

Create a Web Service in Railway linked to the repository.

- **Root Directory**: Root of the monorepo (`/`).
- **Build Command**: `pnpm install && pnpm --filter @hearthlane/api run build`
- **Start Command**: `pnpm --filter @hearthlane/api run start`
- **Environment Variables**:
  - `PORT`: `4000` (mapped automatically by Railway)
  - `DATABASE_URL`: `${{ Postgres.DATABASE_URL }}`
  - `REDIS_URL`: `${{ Redis.REDIS_URL }}`
  - `JWT_SECRET`: Generate a secure random string (e.g. `openssl rand -hex 32`)

### Exact Railway service settings for API

- `Service Type`: Web Service
- `Root Directory`: `/`
- `Build Command`: `pnpm install && pnpm --filter @hearthlane/api run build`
- `Start Command`: `pnpm --filter @hearthlane/api run start`

---

## 3. Web Service (`apps/web`)

Create a Web Service in Railway linked to the repository.

- **Root Directory**: Root of the monorepo.
- **Build Command**: `pnpm install && pnpm --filter @hearthlane/web run build`
- **Start Command**: `pnpm --filter @hearthlane/web run start`
- **Environment Variables**:
  - `PORT`: `3000`
  - `NEXT_PUBLIC_API_URL`: Public URL of your API service (e.g., `https://api-service.up.railway.app`)

### Exact Railway service settings for Web

- `Service Type`: Web Service
- `Root Directory`: `/`
- `Build Command`: `pnpm install && pnpm --filter @hearthlane/web run build`
- `Start Command`: `pnpm --filter @hearthlane/web run start`

---

## 4. BullMQ Worker Service (`apps/worker`)

Create a Private/Worker Service in Railway linked to the repository.

- **Root Directory**: Root of the monorepo.
- **Build Command**: `pnpm install && pnpm --filter @hearthlane/worker run build`
- **Start Command**: `pnpm --filter @hearthlane/worker run start`
- **Environment Variables**:
  - `DATABASE_URL`: `${{ Postgres.DATABASE_URL }}`
  - `REDIS_URL`: `${{ Redis.REDIS_URL }}`

---

## 5. Database Setup (Migrations & Seeding)

To run the database migrations and seed data in production or staging, you can run a one-off job or add it to the API service pre-start step:

- **Run migrations**: `pnpm --filter @hearthlane/db run db:push` or `pnpm --filter @hearthlane/db run db:migrate`
- **Run seeding (for demo instances)**: `pnpm --filter @hearthlane/db run db:seed`
