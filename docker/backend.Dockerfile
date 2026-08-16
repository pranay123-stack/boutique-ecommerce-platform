# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Boutique Commerce API
# Multi-stage: the runtime image carries no compiler, no dev dependencies and
# no source - only the built output and production node_modules.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./
# The seed is compiled too: the runtime image has no ts-node, so
# `npm run db:seed` cannot work there. `db:seed:prod` runs the compiled copy.
RUN npx prisma generate && npm run build && npm run build:seed

# Reinstall without dev dependencies for the runtime layer.
FROM node:20-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY backend/prisma ./prisma
RUN npx prisma generate

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl curl tini \
    && addgroup -g 1001 -S nodejs \
    && adduser -S -u 1001 -G nodejs boutique

COPY --from=prod-deps --chown=boutique:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=boutique:nodejs /app/dist ./dist
COPY --from=build --chown=boutique:nodejs /app/dist-seed ./dist-seed
COPY --from=build --chown=boutique:nodejs /app/prisma ./prisma
COPY --chown=boutique:nodejs backend/package.json ./

# Local-disk uploads need a writable directory owned by the app user.
RUN mkdir -p /app/uploads && chown -R boutique:nodejs /app/uploads

USER boutique
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:4100/health/live || exit 1

# tini reaps zombies and forwards signals so the app shuts down cleanly.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
