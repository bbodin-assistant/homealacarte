#!/usr/bin/env bash
set -euo pipefail

test_port="${HOMEALACARTE_ALLERGEN_TEST_PORT:-18081}"
chrome_port="${HOMEALACARTE_ALLERGEN_CHROME_PORT:-9223}"
origin="http://127.0.0.1:${test_port}"
browser_profile="/tmp/homealacarte-allergen-browser-profile-$$"
python_executable="${PYTHON_EXECUTABLE:-python3}"

"${python_executable}" -m http.server "${test_port}" --bind 127.0.0.1 --directory dist \
  >/tmp/homealacarte-allergen-server.log 2>&1 &
test_server_pid=$!
google-chrome --headless --no-sandbox --disable-gpu \
  --remote-debugging-port="${chrome_port}" --remote-allow-origins=* \
  --user-data-dir="${browser_profile}" about:blank \
  >/tmp/homealacarte-allergen-chrome.log 2>&1 &
test_chrome_pid=$!
trap 'kill "${test_chrome_pid}" "${test_server_pid}" 2>/dev/null || true' EXIT

for _ in $(seq 1 80); do
  if curl --silent --fail "${origin}/" >/dev/null \
    && curl --silent --fail "http://127.0.0.1:${chrome_port}/json" >/dev/null; then
    break
  fi
  sleep 0.1
done

node tests/catalogue_allergens_browser.mjs "${origin}" "${chrome_port}"
