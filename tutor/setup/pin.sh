#!/usr/bin/env bash
# Shows the teacher's PIN on an installed hub, or makes a new one:
#   sudo setup/pin.sh        sudo setup/pin.sh new
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo"; exit 1; fi
CMD=pin
if [ "${1:-}" = "new" ]; then CMD=new-pin; fi
sudo -u qalam bash -c "set -a; . /etc/qalam/hub.env; set +a; cd /opt/qalam/tutor/hub && /opt/qalam/venv/bin/python -m tutor_hub $CMD"
if [ "$CMD" = "new-pin" ]; then systemctl restart tutor-hub; echo "The old PIN no longer works."; fi
