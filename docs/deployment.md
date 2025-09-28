# Deployment & Hosting Checklist

This guide documents the steps required to deploy FlowWeek (API + Web) to a fresh environment.

## 1. Environment Variables

Create two `.env` files before building:

```
apps/api/.env
PORT=3001
DATABASE_URL="file:./dev.db"   # swap to postgres://... in production

apps/web/.env.local
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001
```

For hosted environments, point `DATABASE_URL` to your managed database and set `VITE_*` values to the public API/WebSocket endpoints.

## 2. Install Dependencies

```bash
npm install
npm run install:workspaces
```

## 3. Database Migrations & Seed Data

All Prisma commands live in the API workspace:

```bash
# Apply migrations in dev mode (creates dev.db when using SQLite)
npm run db:dev --workspace apps/api

# Seed starter board/flow/node data
npm run db:seed --workspace apps/api

# Deploy migrations in CI/production
npm run db:migrate --workspace apps/api
```

### Prisma Studio (optional)

Inspect or edit the database via a GUI:

```bash
npx prisma studio --workspace apps/api
```

## 4. Local Development Servers

```bash
npm run dev
```

This launches the API on port `3001` and the React app on `5173`. The WebSocket server shares the API port and now requires no extra configuration beyond `VITE_WS_URL`.

## 5. Production Builds

```bash
npm run build
```

Outputs:

- `apps/api/dist` – compiled Express server (Node 18+)
- `apps/web/dist` – static assets ready for any Vite-compatible host (Netlify, Vercel, S3 + CloudFront, etc.)

Serve the API before the web bundle so the frontend can reach `/api` and the WebSocket endpoint.

## 6. Docker (optional)

A minimal Dockerfile is provided for each workspace. Integrate them into your own Compose stack if you need containerized deployments. Remember to mount or link persistent storage for the Prisma database if you stick with SQLite.

## 7. Operational Notes

- **Real-time IDs** – the frontend automatically injects an `x-client-id` header and sends a WebSocket handshake so the API can suppress echo messages. Keep the header intact when introducing reverse proxies.
- **Optimistic updates** – node PATCH requests include an `x-node-version` header. The server returns HTTP 409 on conflicts, so surface that status to your monitoring.
- **Bulk fixtures** – the dev-only endpoint `POST /api/boards/:id/nodes/bulk` is handy for demo environments. Disable it in production by setting `NODE_ENV=production`.

With these steps the project is ready for both short-lived demos and production hosting.
