FROM node:18-alpine

WORKDIR /app
COPY . .

RUN npm config set unsafe-perm true && npm ci && npm run build && npm prune --production

CMD ["node", "./dist/index.js"]
