FROM node:22-alpine
RUN npm install -g pnpm
WORKDIR /repo
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
RUN pnpm install --filter @workspace/api-server
COPY artifacts/api-server/ ./artifacts/api-server/
WORKDIR /repo/artifacts/api-server
RUN npx esbuild src/index.ts --bundle --platform=node --outfile=dist/index.mjs --format=esm
EXPOSE 8080
CMD ["node", "dist/index.mjs"]
