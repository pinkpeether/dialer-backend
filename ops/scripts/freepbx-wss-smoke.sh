#!/usr/bin/env bash
set -euo pipefail

PBX_HOST="${PBX_HOST:-pbx.ptdt.taxi}"
PBX_WSS_PORT="${PBX_WSS_PORT:-8089}"
PBX_WS_PATH="${PBX_WS_PATH:-/ws}"

echo "== FreePBX/Asterisk WSS Smoke =="
echo "Endpoint: https://${PBX_HOST}:${PBX_WSS_PORT}${PBX_WS_PATH}"
echo

echo "1) DNS lookup"
if command -v dig >/dev/null 2>&1; then
  dig +short "$PBX_HOST" || true
else
  nslookup "$PBX_HOST" || true
fi
echo

echo "2) TCP port test"
if command -v nc >/dev/null 2>&1; then
  nc -vz "$PBX_HOST" "$PBX_WSS_PORT" || true
else
  echo "nc not installed; skipping raw TCP test"
fi
echo

echo "3) HTTPS/WSS endpoint test"
curl -vk "https://${PBX_HOST}:${PBX_WSS_PORT}${PBX_WS_PATH}" || true

echo
cat <<'NOTE'
Expected notes:
- Endpoint path must be lowercase /ws, not /WS.
- Certificate must be trusted on Android/Chrome for browser SIP.
- Timeout/refused means firewall/VPS/Asterisk HTTP/WSS is not open or not running.
NOTE
