FROM node:18-alpine

WORKDIR /app
COPY . .

RUN apk add --no-cache --virtual .build-deps alpine-sdk python3 git openjdk8-jre cmake
RUN npm config set unsafe-perm true && npm ci && npm run build && npm prune --production
RUN apk del .build-deps

CMD ["node", "./dist/index.js"]
