FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY public ./public
COPY templates ./templates
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=4173

EXPOSE 4173

CMD ["node", "server.js"]
