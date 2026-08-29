#!/usr/bin/env bash
set -euo pipefail

port="${HOMEALACARTE_TEST_PORT:-18080}"
origin="http://127.0.0.1:${port}"
browser_log="/tmp/homealacarte-browser-startup.log"
rendered_dom="/tmp/homealacarte-browser-startup.html"
server_log="/tmp/homealacarte-browser-startup-server.log"
browser_profile="/tmp/homealacarte-browser-startup-profile-$$"
python_executable="${PYTHON_EXECUTABLE:-python3}"

"${python_executable}" -m http.server "${port}" --bind 127.0.0.1 --directory dist >"${server_log}" 2>&1 &
server_pid=$!
trap 'kill "${server_pid}" 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
  if curl --silent --fail "${origin}/" >/dev/null; then
    break
  fi
  sleep 0.1
done

timeout 25s google-chrome --headless --no-sandbox --disable-gpu \
  --enable-logging=stderr --v=1 --virtual-time-budget=8000 \
  --user-data-dir="${browser_profile}" \
  --dump-dom "${origin}/" >"${rendered_dom}" 2>"${browser_log}"

if grep -Eiq 'INFO:CONSOLE.*(Uncaught|SyntaxError|ReferenceError|TypeError)' "${browser_log}"; then
  grep -Ei 'INFO:CONSOLE.*(Uncaught|SyntaxError|ReferenceError|TypeError)' "${browser_log}"
  exit 1
fi

grep -Eq '<html[^>]*data-app-module-loaded="true"' "${rendered_dom}"
app_version="$(sed -n 's/.*class="app-version"[^>]*>v\([0-9][0-9]*\)<.*/\1/p' dist/index.html | head -n 1)"
test -n "${app_version}"
grep -Eq "GET /app\\.js\\?v=homealacarte-${app_version} HTTP/1\\.1\" 200" "${server_log}"

echo "The application module starts in Chromium without an uncaught frontend exception."
