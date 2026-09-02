#!/bin/sh

set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/macos_common.sh"

prepare_macos_duckdb
command -v node >/dev/null 2>&1 || fail "Node.js 20 or newer is required."
database=$(node "$TOOLS_DIR/mosaic-release.mjs" status --database)
[ -f "$database" ] || fail "active release database not found: $database"

printf '%s\n' "Opening the active release database as read only:"
printf '  %s\n' "$database"
printf '%s\n' "Type .tables to list objects. Type .exit to close DuckDB."
cd "$KIT_ROOT"
exec "$DUCKDB_BIN" -light-mode -readonly "$database"
