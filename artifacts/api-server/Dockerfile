FROM node:22-alpine
WORKDIR /app
COPY dist/ ./dist/
EXPOSE 8080
CMD ["node", "dist/index.mjs"]
