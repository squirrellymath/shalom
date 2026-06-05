FROM node:20-alpine
WORKDIR /app
COPY artifacts/api-server/dist /app/artifacts/api-server/dist
COPY artifacts/shalom/dist/public /app/artifacts/shalom/dist/public
ENV STATIC_DIR=/app/artifacts/shalom/dist/public
ENV NODE_ENV=production
CMD ["node", "/app/artifacts/api-server/dist/index.mjs"]
