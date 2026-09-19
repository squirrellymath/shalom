FROM node:22-slim
RUN npm install -g pnpm
WORKDIR /repo
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
RUN pnpm install --filter @workspace/api-server... --ignore-scripts
COPY lib/api-zod/ ./lib/api-zod/
COPY lib/db/ ./lib/db/
COPY artifacts/api-server/ ./artifacts/api-server/
ENV MIGRATION_PATH=/repo/lib/db/drizzle/0000_messy_puck.sql
WORKDIR /repo/artifacts/api-server
RUN node build.mjs
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
