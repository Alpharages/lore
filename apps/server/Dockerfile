# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
ENV HUSKY=0
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/cli/package.json ./apps/cli/

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN cd /app/node_modules/.pnpm/bcrypt@5.1.1/node_modules/bcrypt && \
    node /app/node_modules/.pnpm/@mapbox+node-pre-gyp@1.0.11/node_modules/@mapbox/node-pre-gyp/bin/node-pre-gyp install --fallback-to-build

COPY tsconfig.json ./
COPY apps/server/ ./apps/server/

RUN pnpm --filter @lore/server run build

# Runtime stage
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @lore/server

COPY --from=builder \
     /app/node_modules/.pnpm/bcrypt@5.1.1/node_modules/bcrypt/lib/binding \
     /app/node_modules/.pnpm/bcrypt@5.1.1/node_modules/bcrypt/lib/binding

COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/src/db/migrations ./apps/server/src/db/migrations

EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3100/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["sh", "-c", "node apps/server/dist/db/migrate.js && node apps/server/dist/index.js"]
