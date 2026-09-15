#!/bin/sh
set -eu

kit_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
release_tool="$kit_root/tools/mosaic-release.mjs"

command -v node >/dev/null 2>&1 || {
  echo "Node.js 20 or newer is required." >&2
  exit 1
}

node_major=$(node --version | sed -E 's/^v([0-9]+).*/\1/')
test "$node_major" -ge 20 2>/dev/null || {
  echo "Node.js 20 or newer is required; found $(node --version)." >&2
  exit 1
}

echo "Mission Mosaic release decryption preflight"
echo "This tests both encrypted updates without advancing the exercise state."

cd "$kit_root"
node "$release_tool" repair
restore_terminal() {
  stty echo </dev/tty 2>/dev/null || true
}
trap restore_terminal EXIT HUP INT TERM
printf "Enter the first authorized release word: " >&2
stty -echo </dev/tty
IFS= read -r first_word </dev/tty
stty echo </dev/tty
printf "\nEnter the second authorized release word: " >&2
stty -echo </dev/tty
IFS= read -r second_word </dev/tty
stty echo </dev/tty
trap - EXIT HUP INT TERM
printf "\n" >&2
pass=1
while test "$pass" -le 2; do
  echo "Running decryption preflight pass $pass of 2."
  printf '%s\n%s\n' "$first_word" "$second_word" | node "$release_tool" preflight --stdin
  pass=$((pass + 1))
done
first_word=
second_word=
node "$release_tool" status
echo "Both preflight passes succeeded. The exercise release state was not advanced."
