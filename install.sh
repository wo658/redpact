#!/bin/sh
set -eu

version=0.1.0
prefix="${HOME}/.local"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix)
      [ "$#" -ge 2 ] || { echo 'Missing --prefix value' >&2; exit 1; }
      prefix=$2; shift 2 ;;
    --help)
      echo 'Usage: sh install.sh [--prefix ABSOLUTE_PATH]'
      echo 'Installs the GitHub runtime release. Requires Node 24+ and npm.'
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done
case "$prefix" in /*) ;; *) echo 'Prefix must be absolute' >&2; exit 1 ;; esac
case "$(uname -s)" in Darwin|Linux) ;; *) echo 'Supported systems: macOS and Linux' >&2; exit 1 ;; esac
for command in node npm curl; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command: $command" >&2; exit 1; }
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("Node 24+ required"); process.exit(1) }'
if command -v sha256sum >/dev/null 2>&1; then
  checksum=sha256sum
elif command -v shasum >/dev/null 2>&1; then
  checksum=shasum
else
  echo 'Required: sha256sum or shasum' >&2; exit 1
fi
runtime="$prefix/share/redpact"
launcher="$prefix/bin/redpact"
if [ -e "$launcher" ] || [ -L "$launcher" ]; then
  [ -L "$launcher" ] && [ "$(readlink "$launcher")" = "$runtime/node_modules/.bin/redpact" ] || {
    echo "Refusing to replace unrelated executable: $launcher" >&2; exit 1;
  }
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/redpact-install.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
asset="redpact-$version.tgz"
base="https://github.com/wo658/redpact/releases/download/runtime-v$version"
curl --fail --location --silent --show-error --proto '=https' --tlsv1.2 "$base/$asset" -o "$work/$asset"
curl --fail --location --silent --show-error --proto '=https' --tlsv1.2 "$base/SHA256SUMS" -o "$work/SHA256SUMS"
expected=$(awk -v name="$asset" '$2 == name { print $1 }' "$work/SHA256SUMS")
if [ "$checksum" = sha256sum ]; then
  actual=$(sha256sum "$work/$asset" | awk '{print $1}')
else
  actual=$(shasum -a 256 "$work/$asset" | awk '{print $1}')
fi
[ "${#expected}" -eq 64 ] && [ "$expected" = "$actual" ] || { echo 'Release checksum mismatch' >&2; exit 1; }
mkdir -p "$runtime" "$prefix/bin"
npm install --prefix "$runtime" --omit=dev --ignore-scripts --no-audit --no-fund "$work/$asset"
"$runtime/node_modules/.bin/redpact" --help >/dev/null
ln -sfn "$runtime/node_modules/.bin/redpact" "$launcher"
printf '\nInstalled Redpact %s: %s\n' "$version" "$launcher"
printf 'Add %s/bin to PATH, then run: redpact serve --port 54321\n' "$prefix"
echo 'Open http://127.0.0.1:54321 and keep the terminal running. Plugins use the same port.'
