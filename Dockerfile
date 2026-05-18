# === Build stage ===
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy workspace config files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./

# Copy workspace packages needed by api-server
COPY lib/db/ ./lib/db/
COPY lib/api-zod/ ./lib/api-zod/

# Copy api-server source
COPY artifacts/api-server/ ./artifacts/api-server/

# Install dependencies and build
RUN npm_config_user_agent="pnpm/" pnpm install --frozen-lockfile
RUN cd artifacts/api-server && node build.mjs

# === Runtime stage ===
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/artifacts/api-server/dist ./api-server/dist
COPY artifacts/shalom/dist/public ./public
CMD ["node", "api-server/dist/index.mjs"]
