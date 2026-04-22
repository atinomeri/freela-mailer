FROM node:22-slim AS builder
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Build-time placeholders — replaced at container start via real env.
ARG DATABASE_URL=postgresql://user:pass@localhost:5432/db?schema=public
ARG REDIS_URL=redis://localhost:6379
ARG MAILER_PUBLIC_URL=https://freela.ge
ENV DATABASE_URL=$DATABASE_URL \
  REDIS_URL=$REDIS_URL \
  MAILER_PUBLIC_URL=$MAILER_PUBLIC_URL

RUN npm run -s prisma:generate
RUN npm run -s build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
  PORT=3000

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1001 nodejs

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/messages ./messages
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# Runtime TS sources required by scripts/mailer-worker.mjs via tsx.
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN npm prune --omit=dev && npm cache clean --force

EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
