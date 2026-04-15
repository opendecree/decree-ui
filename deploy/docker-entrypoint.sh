#!/bin/sh
# Inject runtime environment variables into the built Vite app.
# Vite bakes VITE_* vars at build time, so we replace placeholder values
# in the compiled JS at container startup.
#
# This script runs as an nginx docker-entrypoint.d hook.

set -e

CONFIG_DIR="/usr/share/nginx/html"

# BROWSER_API_URL is what the browser uses for API calls.
# Default: empty = same origin (browser hits nginx, nginx proxies to API_URL).
# Only set BROWSER_API_URL if the browser should call the API directly (e.g., no proxy).
#
# API_URL is used by nginx for reverse proxying /v1/ requests (Docker-internal hostname).

cat > "$CONFIG_DIR/config.js" <<EOF
window.__DECREE_UI_CONFIG__ = {
  apiUrl: "${BROWSER_API_URL}",
  layoutMode: "${LAYOUT_MODE:-full}",
  tenantId: "${TENANT_ID}",
  schemaId: "${SCHEMA_ID}"
};
EOF
