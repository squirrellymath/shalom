FROM node:22-alpine
WORKDIR /app
COPY artifacts/api-server/package.json ./
COPY artifacts/api-server/package-lock.json* ./
RUN npm install --ignore-scripts 2>/dev/null || true
COPY artifacts/api-server/ ./
RUN npm run build
EXPOSE 8080
CMD ["node", "dist/index.js"]
