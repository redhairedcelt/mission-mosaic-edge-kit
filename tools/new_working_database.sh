#!/bin/sh

set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/macos_common.sh"

name=${1:-analyst_work.duckdb}
case "$name" in
    *[!A-Za-z0-9._-]*|'') fail "the working database name may contain only letters, numbers, dots, underscores, and hyphens." ;;
esac
case "$name" in
    *.duckdb) ;;
    *) fail "the working database name must end in .duckdb." ;;
esac

prepare_macos_duckdb
command -v node >/dev/null 2>&1 || fail "Node.js 20 or newer is required."
master=$(node "$TOOLS_DIR/mosaic-release.mjs" status --database)
workspace="$KIT_ROOT/workspace"
working="$workspace/$name"
[ -f "$master" ] || fail "active release database not found: $master"
mkdir -p "$workspace"

if [ ! -f "$working" ]; then
    cp -p "$master" "$working"
    printf 'Created working database: %s\n' "$working"
else
    printf 'Reusing existing working database: %s\n' "$working"
fi

cd "$KIT_ROOT"
exec "$DUCKDB_BIN" -light-mode "$working"
