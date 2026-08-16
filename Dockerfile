# Node 24 is not optional: the whole storage layer is `node:sqlite`, which does not
# exist in Node 20/22 LTS. Alpine keeps the runtime image small.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    ACCTRAV_DB=/data/acctrav.db \
    ACCTRAV_MIGRATIONS=/app/migrations

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# The standalone bundle plus the three things it reads from disk at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --chown=nextjs:nodejs docker-entrypoint.sh /usr/local/bin/

# The ledger lives on a volume; losing it would lose every payout record.
RUN mkdir -p /data && chown nextjs:nodejs /data && chmod +x /usr/local/bin/docker-entrypoint.sh
VOLUME ["/data"]

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1 || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
