FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps || true
COPY . .
RUN npx esbuild src/index.ts --bundle --platform=node --outfile=dist/index.mjs --format=esm
EXPOSE 8080
CMD ["node", "dist/index.mjs"]
