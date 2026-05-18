FROM node:22-alpine

WORKDIR /app

COPY artifacts/shalom/dist/public/ /app/artifacts/shalom/dist/public/

RUN npm install -g serve

EXPOSE 8080

CMD ["npx", "serve", "/app/artifacts/shalom/dist/public", "-l", "8080"]
