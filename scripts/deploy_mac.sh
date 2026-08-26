#!/usr/bin/env bash
#
# Upload the existing dist/ directory to a remote Mac and serve it over HTTP.
# The SSH password is read from SSH_PASSWORD or from a hidden interactive prompt.

set -euo pipefail

usage() {
    echo "Usage: SSH_PASSWORD='...' $0 SERVER_IP USERNAME [HTTP_PORT] [REMOTE_NAME]"
    echo "Example: SSH_PASSWORD='secret' $0 192.0.2.10 alice 8080 homealacarte"
}

if [[ $# -lt 2 || $# -gt 4 ]]; then
    usage
    exit 2
fi

SERVER_IP=$1
USERNAME=$2
HTTP_PORT=${3:-8080}
REMOTE_NAME=${4:-homealacarte}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
DIST_DIR="$PROJECT_DIR/dist"
SSH_PORT=${SSH_PORT:-22}

if [[ ! "$HTTP_PORT" =~ ^[0-9]+$ ]] || (( HTTP_PORT < 1 || HTTP_PORT > 65535 )); then
    echo "HTTP_PORT must be an integer between 1 and 65535." >&2
    exit 2
fi

if [[ ! "$SSH_PORT" =~ ^[0-9]+$ ]] || (( SSH_PORT < 1 || SSH_PORT > 65535 )); then
    echo "SSH_PORT must be an integer between 1 and 65535." >&2
    exit 2
fi

# Keeping deployments directly below the remote home directory prevents an
# accidental broad deletion when the previous release is replaced.
if [[ ! "$REMOTE_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "REMOTE_NAME may contain only letters, numbers, dots, underscores, and hyphens." >&2
    exit 2
fi

if [[ ! -f "$DIST_DIR/index.html" ]]; then
    echo "dist/index.html is missing. Build the site first with: make build" >&2
    exit 1
fi

for command_name in ssh sshpass tar; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Required local command not found: $command_name" >&2
        exit 1
    fi
done

if [[ -z "${SSH_PASSWORD:-}" ]]; then
    read -r -s -p "SSH password for $USERNAME@$SERVER_IP: " SSH_PASSWORD
    echo
fi

if [[ -z "$SSH_PASSWORD" ]]; then
    echo "The SSH password cannot be empty." >&2
    exit 2
fi

TARGET="$USERNAME@$SERVER_IP"
SSH_OPTIONS=(
    -p "$SSH_PORT"
    -o ConnectTimeout=10
    -o ServerAliveInterval=15
    -o StrictHostKeyChecking=accept-new
)

remote_ssh() {
    SSHPASS="$SSH_PASSWORD" sshpass -e ssh "${SSH_OPTIONS[@]}" "$TARGET" "$@"
}

echo "Building the project..."
make build DATA_DIR=./data
if [[ ! -f "$DIST_DIR/supabase-config.js" ]] \
    || ! grep -Eq '"?projectUrl"?[[:space:]]*:[[:space:]]*"https://[^"]+"' "$DIST_DIR/supabase-config.js" \
    || ! grep -Eq '"?publishableKey"?[[:space:]]*:[[:space:]]*"[^"]+"' "$DIST_DIR/supabase-config.js"; then
    echo "Deployment stopped: dist/supabase-config.js is missing or incomplete." >&2
    echo "Create www/supabase-config.js with the browser-safe Supabase URL and publishable key." >&2
    exit 1
fi
echo "Preparing the remote upload directory..."
remote_ssh "sh -s -- '$REMOTE_NAME'" <<'REMOTE_PREPARE'
set -eu
app_name=$1
incoming="$HOME/.${app_name}.incoming"
rm -rf "$incoming"
mkdir -p "$incoming"
REMOTE_PREPARE

echo "Uploading dist/ to $TARGET..."
tar -C "$DIST_DIR" -czf - . |
    SSHPASS="$SSH_PASSWORD" sshpass -e ssh "${SSH_OPTIONS[@]}" "$TARGET" \
        "tar -xzf - -C \"\$HOME/.${REMOTE_NAME}.incoming\""

echo "Activating the release and starting the remote HTTP server..."
remote_ssh "sh -s -- '$REMOTE_NAME' '$HTTP_PORT'" <<'REMOTE_START'
set -eu

app_name=$1
http_port=$2
app_dir="$HOME/$app_name"
incoming="$HOME/.${app_name}.incoming"
previous="$HOME/.${app_name}.previous"
pid_file="$HOME/.${app_name}-${http_port}.pid"
log_file="$HOME/.${app_name}-${http_port}.log"

if [ ! -f "$incoming/index.html" ]; then
    echo "The uploaded release does not contain index.html." >&2
    exit 1
fi

if [ -f "$pid_file" ]; then
    old_pid=$(cat "$pid_file" 2>/dev/null || true)
    case "$old_pid" in
        ''|*[!0-9]*) ;;
        *)
            if kill -0 "$old_pid" 2>/dev/null; then
                old_command=$(ps -p "$old_pid" -o command= 2>/dev/null || true)
                case "$old_command" in
                    *SimpleHTTPServer*"$http_port"*|*http.server*"$http_port"*)
                        kill "$old_pid"
                        ;;
                esac
            fi
            ;;
    esac
    rm -f "$pid_file"
fi

rm -rf "$previous"
if [ -d "$app_dir" ]; then
    mv "$app_dir" "$previous"
fi
mv "$incoming" "$app_dir"

if command -v python3 >/dev/null 2>&1; then
    python_command=python3
    python_module=http.server
elif command -v python2.7 >/dev/null 2>&1; then
    python_command=python2.7
    python_module=SimpleHTTPServer
elif command -v python >/dev/null 2>&1; then
    python_command=python
    python_major=$(python -c 'import sys; print(sys.version_info[0])')
    if [ "$python_major" = "2" ]; then
        python_module=SimpleHTTPServer
    else
        python_module=http.server
    fi
else
    echo "No Python interpreter was found on the remote Mac." >&2
    exit 1
fi

cd "$app_dir"
nohup "$python_command" -m "$python_module" "$http_port" \
    >"$log_file" 2>&1 </dev/null &
server_pid=$!
echo "$server_pid" >"$pid_file"

server_ready=0
if command -v curl >/dev/null 2>&1; then
    attempt=0
    while [ "$attempt" -lt 10 ]; do
        if ! kill -0 "$server_pid" 2>/dev/null; then
            break
        fi
        if curl -fsS "http://127.0.0.1:${http_port}/" >/dev/null 2>&1; then
            server_ready=1
            break
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
elif kill -0 "$server_pid" 2>/dev/null; then
    server_ready=1
fi

if [ "$server_ready" -ne 1 ]; then
    echo "The HTTP server did not become reachable on port $http_port." >&2
    echo "Remote log ($log_file):" >&2
    tail -n 30 "$log_file" >&2 || true
    exit 1
fi

echo "Python command: $python_command -m $python_module $http_port"
echo "Remote directory: $app_dir"
echo "PID: $server_pid"
echo "Log: $log_file"
REMOTE_START

unset SSH_PASSWORD SSHPASS
echo "Deployment complete: http://$SERVER_IP:$HTTP_PORT/"
