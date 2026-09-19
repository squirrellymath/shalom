FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app
COPY . .
ENV CI=true
RUN pnpm install --frozen-lockfile
ENV PORT=8080
ENV BASE_PATH=/
RUN pnpm --filter @workspace/api-server run build
RUN pnpm --filter @workspace/shalom run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/artifacts/api-server/dist /app/artifacts/api-server/dist
COPY --from=build /app/artifacts/shalom/dist/public /app/artifacts/shalom/dist/public
COPY --from=build /app/lib/db/drizzle/0000_messy_puck.sql /app/lib/db/drizzle/0000_messy_puck.sql
ENV STATIC_DIR=/app/artifacts/shalom/dist/public
ENV MIGRATION_PATH=/app/lib/db/drizzle/0000_messy_puck.sql
ENV NODE_ENV=production
CMD ["node", "/app/artifacts/api-server/dist/index.mjs"]
