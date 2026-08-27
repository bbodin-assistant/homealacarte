#!/usr/bin/env bash
set -euo pipefail

port="${HOMEALACARTE_ROW_SYNC_TEST_PORT:-18081}"
debug_port="${HOMEALACARTE_ROW_SYNC_DEBUG_PORT:-9223}"
origin="http://127.0.0.1:${port}"
debugger_origin="http://127.0.0.1:${debug_port}"
server_log="/tmp/homealacarte-row-sync-browser-server.log"
browser_log="/tmp/homealacarte-row-sync-browser.log"
browser_profile="/tmp/homealacarte-row-sync-browser-profile-$$"
python_executable="${PYTHON_EXECUTABLE:-python3}"

"${python_executable}" -m http.server "${port}" --bind 127.0.0.1 --directory . >"${server_log}" 2>&1 &
server_pid=$!
google-chrome --headless --no-sandbox --disable-gpu \
  --remote-debugging-port="${debug_port}" --remote-allow-origins="*" \
  --user-data-dir="${browser_profile}" about:blank >"${browser_log}" 2>&1 &
browser_pid=$!
trap 'kill "${browser_pid}" "${server_pid}" 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
  if curl --silent --fail "${origin}/tests/row_sync_browser.html" >/dev/null; then
    break
  fi
  sleep 0.1
done

node tests/row_sync_browser.mjs "${origin}" "${debugger_origin}"
