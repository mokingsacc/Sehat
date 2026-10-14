#!/usr/bin/env bash
# Sets up a village hub on Debian, Ubuntu or Raspberry Pi OS (64-bit). Run from the tutor folder:
#   sudo setup/install.sh
# Then: setup/hotspot.sh (Wi-Fi), setup/printer.sh (printer), and print the hub card from the teacher's page.
# Safe to run again after an update: it keeps /etc/qalam/hub.env, the data folder and the teacher PIN.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo setup/install.sh"; exit 1; fi
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST=/opt/qalam

echo "== system packages"
apt-get update
apt-get install -y --no-install-recommends python3 python3-venv python3-pip libpango-1.0-0 libpangoft2-1.0-0 \
  cups cups-client cups-filters avahi-daemon network-manager rsync

echo "== the qalam user and folders"
id qalam >/dev/null 2>&1 || useradd --system --home /var/lib/qalam --shell /usr/sbin/nologin qalam
usermod -aG lpadmin qalam || true
install -d -o qalam -g qalam -m 0750 /var/lib/qalam
install -d -m 0755 "$DEST" "$DEST/models" /etc/qalam

echo "== the hub's files"
rsync -a --delete --exclude data --exclude .venv --exclude review-sheets "$SRC/" "$DEST/tutor/"
python3 -m venv "$DEST/venv"
"$DEST/venv/bin/pip" install --quiet --upgrade pip
"$DEST/venv/bin/pip" install --quiet -r "$DEST/tutor/hub/requirements.txt"

if [ ! -f /etc/qalam/hub.env ]; then
  install -m 0640 -g qalam "$SRC/setup/hub.env.example" /etc/qalam/hub.env
  echo "   wrote /etc/qalam/hub.env: set the Wi-Fi name and password there"
fi

echo "== checking the lessons"
"$DEST/venv/bin/python" "$DEST/tutor/tools/validate_pack.py" "$DEST/tutor/content/packs" \
  || echo "   the lessons above have problems: the hub leaves them out until they are fixed"

echo "== the hub service"
install -m 0644 "$SRC/setup/tutor-hub.service" /etc/systemd/system/tutor-hub.service
if [ -x "$DEST/llama.cpp/build/bin/llama-server" ] && [ -e "$DEST/models/current.gguf" ]; then
  install -m 0644 "$SRC/setup/llama-server.service" /etc/systemd/system/llama-server.service
  systemctl daemon-reload
  systemctl enable --now llama-server
  echo "   the AI model server is on"
else
  echo "   no AI model yet (see docs/HUB-SETUP.md, step 6): the hub answers from checked answers and the teacher"
fi
systemctl daemon-reload
systemctl enable --now tutor-hub
systemctl restart tutor-hub

echo "== done"
"$SRC/setup/pin.sh"
echo "Give this PIN to the teacher only. Open http://10.42.0.1 on a phone on the hub's Wi-Fi to try it."
