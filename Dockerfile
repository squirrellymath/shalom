FROM node:22-alpine
WORKDIR /app
COPY artifacts/api-server/dist ./api-server/dist
COPY artifacts/api-server/package.json ./api-server/package.json
COPY artifacts/shalom/dist/public ./public
RUN cd api-server && npm install --production
EXPOSE 8080
CMD ["node", "api-server/dist/index.mjs"]
