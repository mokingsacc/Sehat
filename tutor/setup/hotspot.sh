#!/usr/bin/env bash
# Turns the hub's Wi-Fi into a hotspot that phones join (no internet needed). Uses NetworkManager.
#   sudo setup/hotspot.sh "Qalam" "a-long-password"
# The hub is then at http://10.42.0.1 and http://qalam.lan for every phone on this Wi-Fi.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo"; exit 1; fi
SSID="${1:-Qalam}"
PASS="${2:-}"
if [ ${#PASS} -lt 8 ]; then echo "Give a Wi-Fi password of at least 8 characters: sudo setup/hotspot.sh \"$SSID\" \"password\""; exit 1; fi
IFACE="$(nmcli -t -f DEVICE,TYPE device | awk -F: '$2=="wifi"{print $1; exit}')"
if [ -z "$IFACE" ]; then echo "No Wi-Fi device found"; exit 1; fi

# phones may also type qalam.lan
mkdir -p /etc/NetworkManager/dnsmasq-shared.d
echo "address=/qalam.lan/10.42.0.1" > /etc/NetworkManager/dnsmasq-shared.d/qalam.conf

nmcli connection delete qalam-hotspot >/dev/null 2>&1 || true
nmcli connection add type wifi ifname "$IFACE" con-name qalam-hotspot autoconnect yes ssid "$SSID" \
  802-11-wireless.mode ap 802-11-wireless.band bg \
  ipv4.method shared ipv4.addresses 10.42.0.1/24 ipv6.method disabled \
  wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PASS"
nmcli connection up qalam-hotspot
echo "Hotspot \"$SSID\" is on. Put the same name and password in /etc/qalam/hub.env for the printed hub card,"
echo "then: sudo systemctl restart tutor-hub"
