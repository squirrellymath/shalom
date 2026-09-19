# Shalom

Shalom is a private conversation space for two participants, with optional mediated messages and invite-based access.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 22 in deployment and TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/shalom/src/` — React/Vite frontend
- `lib/db/src/schema/` — Drizzle schema source
- `lib/db/drizzle/` — checked-in SQL migrations
- `lib/api-spec/openapi.yaml` — API contract source

## Architecture decisions

- SSO callback tokens are stored as SHA-256 hashes and are single-use.
- Invite acceptance and participant assignment happen in one transaction.
- The API serves the web build in the production image and is also available under `/api`.
- Message hash serialization and `computeHash` inputs are stable compatibility contracts.

## Product

- Members create witness or mediated conversations.
- Conversation owners invite participants with expiring links.
- Participants can read and send messages only in conversations they belong to.

## Gotchas

- `SESSION_SECRET` is required at API startup; do not add a fallback.
- `DATABASE_URL` must point at the intended environment before applying migrations.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
