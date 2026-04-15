#!/bin/sh
# Inject runtime environment variables into the built Vite app.
# Vite bakes VITE_* vars at build time, so we replace placeholder values
# in the compiled JS at container startup.
#
# This script runs as an nginx docker-entrypoint.d hook.

set -e

CONFIG_DIR="/usr/share/nginx/html"

# Build a runtime config object from environment variables
cat > "$CONFIG_DIR/config.js" <<EOF
window.__DECREE_UI_CONFIG__ = {
  apiUrl: "${API_URL}",
  layoutMode: "${LAYOUT_MODE:-full}",
  tenantId: "${TENANT_ID}",
  schemaId: "${SCHEMA_ID}"
};
EOF
