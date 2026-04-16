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

# Runtime env vars (overridable)
ENV API_URL="http://localhost:8080"
ENV BROWSER_API_URL=""
ENV LAYOUT_MODE="full"
ENV TENANT_ID=""
ENV SCHEMA_ID=""
ENV DEFAULT_ROLE=""
ENV DEFAULT_SUBJECT=""
