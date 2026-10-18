#!/bin/sh
set -eu

node /app/scripts/start-api.cjs &
api_pid=$!
nginx -g 'daemon off;' &
nginx_pid=$!
trap 'kill "$api_pid" "$nginx_pid" 2>/dev/null || true' INT TERM

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 1
done

kill "$api_pid" "$nginx_pid" 2>/dev/null || true
wait "$api_pid" 2>/dev/null || true
wait "$nginx_pid" 2>/dev/null || true
exit 1
