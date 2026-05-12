# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
ENV HUSKY=0
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm run build

# Runtime stage
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/migrations ./src/db/migrations
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3100/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
