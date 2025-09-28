# FlowWeek

A full-stack application with React frontend and Node.js backend, built with modern development practices.

## Project Structure

```
flowweek/
├── apps/
│   ├── api/          # Node.js + Express + TypeScript backend
│   └── web/          # React + Vite + TypeScript frontend
├── .github/
│   └── workflows/    # CI/CD pipelines
├── docker-compose.yml # Docker orchestration
├── package.json      # Monorepo root with workspaces
└── README.md
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, TanStack Query, Zustand
- **Backend**: Node.js, Express, TypeScript
- **Testing**: Jest, Testing Library
- **Code Quality**: ESLint, Prettier
- **Containerization**: Docker, Docker Compose
- **CI/CD**: GitHub Actions

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Ryugi62/FlowWeek.git
   cd FlowWeek
   ```

2. Install dependencies:
   ```bash
   npm install
   npm run install:workspaces  # Install dependencies in each workspace
   ```

3. Start development servers:
   ```bash
   npm run dev
   ```
   This will start both the API server (port 3001) and the web app (port 5173).

### Environment Variables

Create the following files:

**apps/api/.env**:
```
PORT=3001
DATABASE_URL="file:./dev.db"
NODE_ENV=development
```

**apps/web/.env.local**:
```
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001 # optional: enable realtime previews
```

## Available Scripts

### Root Scripts
- `npm run dev` - Start both API and web in development mode
- `npm run build` - Build both API and web
- `npm run lint` - Lint both apps
- `npm run format` - Format code with Prettier
- `npm run test` - Run tests for both apps

### API Scripts
- `npm run dev:api` - Start API server with hot reload
- `npm run db:dev --workspace apps/api` - Run Prisma migrations against the local SQLite database
- `npm run db:migrate --workspace apps/api` - Apply pending migrations (useful in CI/deploys)
- `npm run db:seed --workspace apps/api` - Seed the database with sample board/flow data
- `npm run build:api` - Build API for production
- `npm run test:api` - Run API tests

### Web Scripts
- `npm run dev:web` - Start web app with hot reload
- `npm run build:web` - Build web app for production
- `npm run test:web` - Run web tests

## Development

### Code Quality

- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier with consistent rules
- **Testing**: Jest with Testing Library for React components

### Docker

Build and run with Docker Compose:
```bash
docker-compose up --build
```

### CI/CD

GitHub Actions automatically runs:
- Dependency installation
- Linting and formatting checks
- Test execution
- Build verification

## API Endpoints

- `GET /api/boards/:boardId/flows` - Get flows for a board
- `GET /api/boards/:boardId/nodes` - Get nodes for a board
- `GET /api/boards/:boardId/edges` - Get edges for a board
- `POST /api/boards/:boardId/nodes/bulk` - (development only) generate up to 500 nodes for performance testing
- Standard CRUD endpoints exist for nodes and edges via `POST/PATCH/DELETE`
- WebSocket broadcasts include `{ meta: { clientId, timestamp } }` so clients can suppress their own echoes

## Further Reading

- [`docs/performance.md`](docs/performance.md) – reproducible FPS/input-latency workflow using the new bulk endpoint and canvas HUD
- [`docs/deployment.md`](docs/deployment.md) – end-to-end deployment checklist (env vars, Prisma commands, build output, Docker notes)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT
