# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Boutique Commerce storefront (Next.js standalone output)
# ---------------------------------------------------------------------------

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
# Public env vars are inlined at build time by Next.
ARG NEXT_PUBLIC_API_URL=/api/proxy
ARG NEXT_PUBLIC_API_ORIGIN=http://backend:4100
ARG NEXT_PUBLIC_SITE_NAME=Boutique
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3100
# Business identity for the legal pages. Left blank by default on purpose:
# the pages then show an unmistakable "not ready to publish" banner rather
# than presenting invented company details as though they were real.
ARG NEXT_PUBLIC_LEGAL_NAME=
ARG NEXT_PUBLIC_GSTIN=
ARG NEXT_PUBLIC_BUSINESS_ADDRESS=
ARG NEXT_PUBLIC_SUPPORT_EMAIL=
ARG NEXT_PUBLIC_SUPPORT_PHONE=
ARG NEXT_PUBLIC_GRIEVANCE_OFFICER=
ARG NEXT_PUBLIC_GRIEVANCE_EMAIL=
ARG NEXT_PUBLIC_JURISDICTION=Bengaluru, Karnataka
ARG NEXT_PUBLIC_RETURN_WINDOW_DAYS=7
ARG NEXT_PUBLIC_EXCHANGE_WINDOW_DAYS=14
ARG NEXT_PUBLIC_COD_CHARGE=49
ARG NEXT_PUBLIC_ALLOW_INDEXING=true
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN \
    NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_LEGAL_NAME=$NEXT_PUBLIC_LEGAL_NAME \
    NEXT_PUBLIC_GSTIN=$NEXT_PUBLIC_GSTIN \
    NEXT_PUBLIC_BUSINESS_ADDRESS=$NEXT_PUBLIC_BUSINESS_ADDRESS \
    NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL \
    NEXT_PUBLIC_SUPPORT_PHONE=$NEXT_PUBLIC_SUPPORT_PHONE \
    NEXT_PUBLIC_GRIEVANCE_OFFICER=$NEXT_PUBLIC_GRIEVANCE_OFFICER \
    NEXT_PUBLIC_GRIEVANCE_EMAIL=$NEXT_PUBLIC_GRIEVANCE_EMAIL \
    NEXT_PUBLIC_JURISDICTION=$NEXT_PUBLIC_JURISDICTION \
    NEXT_PUBLIC_RETURN_WINDOW_DAYS=$NEXT_PUBLIC_RETURN_WINDOW_DAYS \
    NEXT_PUBLIC_EXCHANGE_WINDOW_DAYS=$NEXT_PUBLIC_EXCHANGE_WINDOW_DAYS \
    NEXT_PUBLIC_COD_CHARGE=$NEXT_PUBLIC_COD_CHARGE \
    NEXT_PUBLIC_ALLOW_INDEXING=$NEXT_PUBLIC_ALLOW_INDEXING \
    NEXT_TELEMETRY_DISABLED=1 \
    BUILD_STANDALONE=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache curl tini \
    && addgroup -g 1001 -S nodejs \
    && adduser -S -u 1001 -G nodejs nextjs

# `standalone` ships a minimal server plus only the modules actually imported.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --chown=nextjs:nodejs docker/frontend-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER nextjs
EXPOSE 3100
ENV PORT=3100 HOSTNAME=0.0.0.0

# Healthy means "serving the shop", not merely "answering on the port". The
# storefront degrades to a short fallback page when the catalogue is
# unavailable, and a container serving that is not ready for traffic.
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD curl -fsS http://localhost:3100 | grep -q 'product-grid' || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/entrypoint.sh"]
