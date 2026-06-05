#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-https://dialer-backend-production-2a23.up.railway.app/api}"
FRONTEND_URL="${FRONTEND_URL:-https://dialer-frontend-production.up.railway.app}"
PBX_WSS_HTTPS="${PBX_WSS_HTTPS:-https://pbx.ptdt.taxi:8089/ws}"

echo "== PTDT Platform Smoke =="
echo "API_BASE=$API_BASE"
echo "FRONTEND_URL=$FRONTEND_URL"
echo "PBX_WSS_HTTPS=$PBX_WSS_HTTPS"
echo

echo "1) Backend health"
curl -i "$API_BASE/health"
echo

echo "2) Frontend headers"
curl -I "$FRONTEND_URL" || true
echo

echo "3) PBX WSS reachability / certificate"
curl -vk "$PBX_WSS_HTTPS" || true
echo

echo "Done. Review HTTP status codes and certificate output above."
