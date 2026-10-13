# Vue vs Svelte Benchmark

A small reporting application and benchmark suite for comparing Vue 3 and Svelte 5. Both frontends use the same Express API and are tested with Playwright.

## Project Structure

- `apps/frontend-vue/` - Vue 3 frontend, served on port 5173.
- `apps/frontend-svelte-plain/` - Svelte 5 frontend, served on port 5174.
- `services/backend-api/` - Express and TypeScript API, served on port 3001.
- `tests/` - Playwright functional tests and performance benchmark runners.
- `Dockerfile` and `docker-compose.yml` - containerized benchmark environment.

The API exposes reports at `/api/reports` and a health check at `/api/health`.

## Requirements

- Node.js and npm
- Docker, for containerized benchmarks

## Install and Run

Install dependencies for all workspaces and the Playwright Chromium browser:

```sh
npm run install:all
```

Start the API and both frontends together:

```sh
npm run dev
```

The services are available at `http://localhost:3001`, `http://localhost:5173`, and `http://localhost:5174`.

## Tests and Benchmarks

Run the Playwright test suite:

```sh
npm run test:all
```

Run the benchmark suites ten times:

```sh
npm run bench:10
```

Run the Docker benchmark suite:

```sh
npm run docker:bench
```

Benchmark output is written under `tests/benchmark-results/`.
