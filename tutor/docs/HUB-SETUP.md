# Setting up a hub

A hub is one computer with a Wi-Fi hotspot and a printer. Phones join its Wi-Fi (no internet anywhere) and open
`http://10.42.0.1`: Qalam's website, whose year tiles open the app at `http://10.42.0.1/app/` (a phone that already
has a learner goes straight there, and a class card's `/?join=` code too). It works without an AI model; the model
only adds answers to new questions.

## What to buy (estimates from the plan, January 2027 tests decide)

| | Try it | Home box | Village or school hub |
|---|---|---|---|
| Computer | any laptop | Jetson Orin Nano Super, or a Raspberry Pi 5 without AI | Jetson AGX Orin 64 GB (about $2,000), or a Ryzen AI Max+ 395 mini PC with 128 GB |
| AI | none | a small model, Dari only | a 30B-class open model, chosen by the January test |
| Printer | none (PDFs) | ink-tank printer | ink-tank printer (Epson EcoTank or Canon G series), USB, two-sided if possible |
| Power | mains | small solar kit | about 400 W of panels, a 2 kWh LiFePO4 battery, a 1 kW inverter |

Use an **ink-tank printer, not a laser**: a laser draws 300-600 W while printing, with spikes over 1,000 W, which
an off-grid battery cannot carry. Check that the printer supports driverless printing (IPP Everywhere or AirPrint);
most printers sold since about 2018 do. Keep the hub in a lockable box with air flow, out of the dust.

## 1. Try it on a laptop

```bash
cd tutor/hub
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt     # Linux: sudo apt install libpango-1.0-0 libpangoft2-1.0-0
TUTOR_PRINT=outbox .venv/bin/python -m tutor_hub serve --port 8080
```

Open `http://localhost:8080` (or the laptop's address from a phone on the same Wi-Fi). Printed sheets land as PDFs
in `tutor/data/outbox/`. The teacher PIN: `.venv/bin/python -m tutor_hub pin`.

## 2. Install on the hub computer

Debian, Ubuntu (including Jetson's JetPack) or Raspberry Pi OS, 64-bit. Copy the `tutor` folder over (a USB stick
is fine), then:

```bash
cd tutor
sudo setup/install.sh
```

It installs the system packages, makes a `qalam` user, puts the hub in `/opt/qalam`, the settings in
`/etc/qalam/hub.env`, the data in `/var/lib/qalam`, starts the `tutor-hub` service on port 80 and shows the
teacher PIN. Run it again after an update; it keeps the settings, the data and the PIN.

## 3. Wi-Fi

```bash
sudo setup/hotspot.sh "Qalam" "a-long-password"
```

Put the same name and password in `/etc/qalam/hub.env` (`TUTOR_WIFI_SSID`, `TUTOR_WIFI_PASSWORD`), then
`sudo systemctl restart tutor-hub`. Phones can open `http://10.42.0.1` or `http://qalam.lan`. For homes further away,
add an access point (an outdoor one if needed) bridged to the hub.

## 4. Printer

```bash
sudo setup/printer.sh                 # lists the printers the hub can see
sudo setup/printer.sh "ipp://..."     # adds one as "Qalam" and makes it the default
```

A USB printer that is not driverless needs its maker's Linux driver first. Without a printer, set
`TUTOR_PRINT=outbox` and the teacher prints the saved PDFs from `/var/lib/qalam/outbox` later.

## 5. The teacher

Give the PIN to the teacher only: `sudo setup/pin.sh` shows it, `sudo setup/pin.sh new` makes a new one.
On a phone or laptop on the hub's Wi-Fi, open `http://10.42.0.1/teacher/` (or tap Teacher on the app's Who is
learning screen) and type the PIN. From there:

- **To do**, one card at a time: a child who may be in danger first (talk to her), then answers held for you (when
  hold-for-teacher is on), then questions sent to you. Reply, send, edit or don't send; a reply marked "Use it for
  others too" helps the next child.
- **Class:** who was active this week, each child by her picture and number, "needs help", and a lock reset code
  when she forgot her PIN. **Print class card** and **Print the hub card** (put it on the wall: a QR code to join the
  Wi-Fi and one to open the app).
- **Lessons:** how each lesson went, the hardest question, and the answer sheet.

## 5a. The admin panel

The admin (Mo or the hub's keeper, never the teacher) has a PIN of her own: `.venv/bin/python -m tutor_hub admin-pin`
shows it and `new-admin-pin` makes a new one. Open `http://10.42.0.1/admin/` and type it. There: the class's code and
its class cards (the code shows once, so print the cards then, or draw a new code), the modules switched on or off
with their risks, the two kill switches (AI off, school day off), hold-for-teacher and lock reset codes (the
`teacher` module's settings), the school day's timetable, the AI budget, the packs' releases, the wishlist, AI use,
safety counts and the log of every change. On the hub there is no staff list: the two PINs are the staff gate.

## 6. The AI (optional)

1. Build llama.cpp in `/opt/qalam/llama.cpp` (on a Jetson: `cmake -B build -DGGML_CUDA=ON && cmake --build build -j`).
2. Put the chosen model file in `/opt/qalam/models/` and point `current.gguf` at it:
   `sudo ln -sf /opt/qalam/models/<model>.gguf /opt/qalam/models/current.gguf`.
3. Run `sudo setup/install.sh` again: it finds the model and starts `llama-server` on 127.0.0.1:8081.

To swap the model later, change the link and `sudo systemctl restart llama-server`. The hub needs no change; it
checks every 30 seconds whether the model is answering. Pashto stays teacher-written (`TUTOR_AI_LANGS=prs,en`)
until a model passes the Pashto question set.

## 7. Check it works

On a cheap Android phone: join the Wi-Fi, scan the card, pick a year, start a lesson, print its sheet, ask
`۱/۲ + ۱/۴ چند می‌شود؟`. On the teacher page (`/teacher/`) the question waits under To do if nobody could answer it, and the print shows in
the outbox or on paper.

## Keeping it going

- **Backups:** copy `/var/lib/qalam` (the approved answers live in `hub.db`) to a USB stick every week.
- **New lessons:** copy a pack folder into `/opt/qalam/tutor/content/packs/`, run
  `/opt/qalam/venv/bin/python /opt/qalam/tutor/tools/validate_pack.py /opt/qalam/tutor/content/packs`, then
  `sudo systemctl restart tutor-hub`.
- **Power cuts** are expected: the database writes every answer to disk before replying, and print jobs cut off
  by a restart are marked failed so the child prints again.
- **Logs:** `journalctl -u tutor-hub -e`.
