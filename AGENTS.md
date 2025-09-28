# Repository Guidelines

## Project Structure & Module Organization
FlowWeek is an npm workspace monorepo. The root `package.json` orchestrates `apps/api` (Express + TypeScript backend) and `apps/web` (React 19 + Vite frontend). Backend logic lives in `apps/api/src/index.ts` with mock CRUD endpoints and optional WebSocket helpers. Frontend code lives in `apps/web/src`, with feature folders such as `components/`, `stores/`, `api/`, and shared assets, while static files remain in `apps/web/public`.

## Build, Test, and Development Commands
Run commands from the repository root. 
- `npm install && npm run install:workspaces` prepares dependencies.
- `npm run dev` starts the API on `localhost:3001` and the web app on `localhost:5173`.
- `npm run build` outputs bundles to `apps/api/dist` and `apps/web/dist`.
- `npm run lint` plus `npm run format:check` keep linting and formatting aligned.
- `npm run test`, or the scoped variants, runs Jest suites; append `:watch` while iterating.

## Coding Style & Naming Conventions
Prettier enforces two-space indentation, 80-character width, semicolons, and single quotes; run `npm run format` before commits. Respect the ESLint configs in each workspace and prefer explicit TypeScript types over `any`. Use PascalCase for React components, camelCase for hooks and stores, and SCREAMING_SNAKE_CASE for environment variables. Keep files beside their feature folder and favour small, focused modules.

## Testing Guidelines
Jest with ts-jest powers both workspaces, and the web app loads Testing Library via `apps/web/src/setupTests.ts`. Place UI specs as `<Component>.test.tsx` or inside `__tests__` next to the feature. API specs belong under `apps/api/src/**/*.test.ts`. Stub network calls against the Express mocks and confirm `npm run test` passes before requesting review.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`) as seen in the history. Keep subjects imperative and ≤72 characters; add scopes when helpful (`feat(canvas): drag preview`). Pull requests should explain changes, link issues, call out configuration updates, and note test evidence (`npm run test:web`, screenshots). Split sweeping refactors from feature delivery when possible.

## Environment & Configuration Tips
Copy `.env` files before running services: `apps/api/.env` controls `PORT`, and `apps/web/.env.local` sets `VITE_API_URL`. Update `README.md` and `docker-compose.yml` whenever configuration changes. WebSocket collaboration needs the optional `ws` package; install it if you exercise realtime flows. Adjust the 3001 and 5173 bindings via env vars to avoid local conflicts.
