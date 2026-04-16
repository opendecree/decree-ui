# Build stage
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage
FROM nginx:1-alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config — SPA routing + API reverse proxy
COPY deploy/nginx.conf /etc/nginx/templates/default.conf.template

# Entrypoint injects runtime env vars into the built JS
COPY deploy/docker-entrypoint.sh /docker-entrypoint.d/40-env-config.sh
RUN chmod +x /docker-entrypoint.d/40-env-config.sh

EXPOSE 80

# Runtime env vars (overridable).
# See docs/ui-modes.md for full documentation of modes and personas.
ENV API_URL="http://localhost:8080"
# Backend URL for nginx reverse proxy (Docker-internal hostname).
ENV BROWSER_API_URL=""
# Browser API URL. Empty = same-origin (nginx proxies /v1/ to API_URL).
ENV LAYOUT_MODE="full"
# UI mode: full, single-tenant, single-schema. See docs/ui-modes.md.
ENV TENANT_ID=""
# Pre-selected tenant UUID or name slug. Required for single-tenant mode.
ENV SCHEMA_ID=""
# Pre-selected schema UUID or name slug. Required for single-schema mode.
ENV DEFAULT_ROLE=""
# Default auth role: superadmin, admin, user. Empty = superadmin.
ENV DEFAULT_SUBJECT=""
# Default auth subject identity. Empty = "admin".
