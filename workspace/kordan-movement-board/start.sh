#!/bin/sh
set -eu
cd "$(dirname "$0")"
PORT="${PORT:-4175}" OPEN_BROWSER="${OPEN_BROWSER:-0}" node server.mjs
