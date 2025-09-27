# FlowWeek

A full-stack application with React frontend and Node.js backend.

## Project Structure

- `apps/web/`: React + TypeScript frontend using Vite
- `apps/api/`: Node.js + Express + TypeScript backend API

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   cd apps/api && npm install
   cd ../web && npm install
   ```

2. Run the development servers:
   ```bash
   npm run dev
   ```
   This will start both the API server (port 3001) and the web app (port 5173).

## Scripts

- `npm run dev`: Start both API and web in development mode
- `npm run dev:api`: Start only the API server
- `npm run dev:web`: Start only the web app
- `npm run build`: Build both API and web
- `npm run lint`: Lint both API and web
