FROM node:22-alpine AS builder
WORKDIR /repo
ENV HUSKY=0

RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --filter @lore/web...

COPY apps/web ./apps/web
RUN mkdir -p ./apps/web/public
ARG NEXT_PUBLIC_LORE_API_URL
ENV NEXT_PUBLIC_LORE_API_URL=$NEXT_PUBLIC_LORE_API_URL
RUN pnpm --filter @lore/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001').then(r => r.status < 500 ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "apps/web/server.js"]
