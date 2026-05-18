FROM node:18-alpine
RUN npm install -g serve
COPY artifacts/shalom/dist/public /public
CMD ["serve", "/public", "-l", "8080"]
