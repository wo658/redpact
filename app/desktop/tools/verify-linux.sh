#!/usr/bin/env bash
set -euo pipefail
package=$(realpath "$1")
sudo apt-get install -y "$package"
dpkg-query --show redpact
xvfb-run -a dbus-run-session -- node app/desktop/tools/verify-dmg.mjs /usr/bin/redpact-desktop /usr/lib/Redpact/runtime
sudo apt-get remove -y redpact
test ! -f /usr/bin/redpact-desktop
