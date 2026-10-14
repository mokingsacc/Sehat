#!/usr/bin/env bash
# Adds the hub's printer to CUPS without a driver (IPP Everywhere / AirPrint: most office printers since about 2018).
#   sudo setup/printer.sh            list the printers this hub can see
#   sudo setup/printer.sh <uri>      add one as "Qalam" and make it the default
# A USB printer that is not driverless needs its maker's Linux driver first (docs/HUB-SETUP.md).
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo"; exit 1; fi
if [ $# -eq 0 ]; then
  echo "Printers found (copy one address and run: sudo setup/printer.sh <address>):"
  lpinfo --include-schemes dnssd,ipp,ipps,usb -v 2>/dev/null | awk '{print "  " $2}'
  exit 0
fi
lpadmin -p Qalam -E -v "$1" -m everywhere -o media-default=iso_a4_210x297mm -o sides-default=one-sided
lpadmin -d Qalam
cupsenable Qalam && cupsaccept Qalam
echo "Printer added. Test page: lp -d Qalam /usr/share/cups/data/testprint"
