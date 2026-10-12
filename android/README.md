# Sehat for Android (صحت)

A small Android app that contains the whole web app (the folder above this one), so people can install it from an
APK file and **pass it from phone to phone without internet** (Bluetooth, Quick Share, Files by Google, ShareIt).

- Package name (application id): **`org.sehat.app`**. Never change it: Android treats a different id as a different app.
- App name on the phone: صحت (`app/src/main/res/values/strings.xml`).
- Works on Android 5.0 and newer (minSdk 21), targets Android 16 (API 36). Plain Java, one Activity, one WebView.
- File name when sent to another phone: `sehat.apk`.

## How it works
- The web app is copied into the APK (`app/src/main/assets/www/`) by `sync-web.sh`, which Gradle runs before every
  build. It copies `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `fonts/`, `img/` (not `img/_preview`),
  `content/book.json` and `content/version.json`. Run `python3 tools/build.py` first, as usual.
- **Pictures in the APK:** all of `img/` except the picture-step sets that are not Emergency or CPR ("on-demand" in
  `book.steps`, chosen by `tools/build.py`): those stay on the website and download the first time their page is
  opened, from `appUrl`; the SVG version plays until then (`docs/STEPS_PLAYER.md`, "Where the pictures live"). This
  keeps the APK about 12 MB with every Emergency set inside (Mo, 9 Oct 2026), under 15 MB.
- **Narration in the APK: only Emergency and CPR, woman's voice, Dari and Pashto** (`book.bundle`, listed by
  `tools/build.py` from the same order as the app's downloads; 220 clips, about 6.3 MB), so a phone that gets the app
  by Bluetooth and never goes online still hears emergencies. The app plays these from inside the APK and never
  downloads them. Everything else comes from the website (`appUrl` in `config.json`) for the chosen voice only and is
  kept on the phone; a man's voice downloads its own clips and, offline, falls back to the bundled woman's clips.
  Offline and not on the phone: the other voice, then the phone's own speech, then a short note.
- The WebView opens `https://appassets.androidplatform.net/assets/index.html`, served from the APK by
  `androidx.webkit.WebViewAssetLoader`. It is a secure https origin, so localStorage, IndexedDB, Cache Storage,
  `fetch()` of relative files, the microphone and location all work as on a website.
- **Service worker:** it registers and works. Its own requests are routed to the same asset loader
  (`ServiceWorkerControllerCompat`), so it can precache from the APK and keep downloaded narration offline. On a phone
  whose WebView is too old for that, the service worker simply fails to install and the app still works fully offline,
  because every file is in the APK anyway. The one thing lost then: narration clips that were uploaded in the online
  editor (not built into the APK) play only while online.
- A small script (`app/src/main/assets/fhb-android.js`) is added to `index.html` when it is served. The WebView has
  no Web Share API, so it provides `navigator.share()`: sharing a file (the recordings zip) opens the Android share
  sheet; sharing the app's own address (when `appUrl` in `config.json` is empty) **sends the APK**; other links are
  shared as text. It also adds the class `fhb-android` to `<html>`.
- Back button walks back through the pages. Map directions and phone numbers open in Google Maps / the dialer.
- File inputs (`<input type="file">`) open the phone's file picker; a picture input with `capture` opens the camera (no camera permission is asked: the camera app takes the photo). Used by the family records (medicine photos, "Get records from a file").
- Asks for microphone permission (recording studio, spoken feedback) and location (nearest clinic) only when the
  page asks for them.

### JavaScript bridge: `window.FHBAndroid`
| call | does |
|---|---|
| `FHBAndroid.isAndroidApp()` | `true` |
| `FHBAndroid.appVersion()` | the app version (= the book version it was built with, e.g. `2026.10.07-3f5f53`) |
| `FHBAndroid.shareApp()` | opens the share sheet with the installed APK (`sehat.apk`) |
| `FHBAndroid.shareFile(base64, name, mime)` | shares a file made by the page (used by the `navigator.share` shim) |
| `FHBAndroid.shareText(title, text)` | shares text |
| `FHBAndroid.shareAppTo(pkg)` | sends the APK straight to one messaging app (WhatsApp, Telegram, IMO, Messenger; only the packages listed in `ShareTargets.java` and in the manifest `<queries>`); falls back to the share sheet |
| `FHBAndroid.isInstalled(pkg)` | `true` if that messaging app is on the phone (used to grey out its button) |
| `FHBAndroid.apkSize()` | size of the APK in bytes, shown on the share screen |
| `FHBAndroid.shareFileTo(base64, name, mime, pkg)` | sends a file made by the page (the family records file) straight to one listed messaging app; false = not possible |
| `FHBAndroid.setReminders(json)` | the medicine doses still to come, for the phone's own reminders (below) |
| `FHBAndroid.notifyState()` | `"on"` (notifications can show), `"ask"` (Android 13+, not allowed yet), `"off"` (switched off in the phone's settings) |
| `FHBAndroid.askNotify()` | Android 13+: the phone's "Allow notifications?" question |
| `FHBAndroid.exactReminders()` | `false` on Android 12+ when "Alarms and reminders" is not allowed (reminders then come a few minutes late) |

The app calls `window.sehatRemindNow()` in the page when a reminder notification is tapped or its alarm rings while the
app is on the screen.

### Medicine reminders (`Reminders.java`, `ReminderPlan.java`, `ReminderReceiver.java`)
The family records (`js/family.js`) call `setReminders(json)` at start, after every change (a medicine added or
deleted, "Taken", "Later", the family's medicine times, records received) and when the list changes as time passes:
`{v: 1, win: 180, chan: "<channel name>", items: [{k, d, hm, at, t, b}]}`, one item per dose from the one due now to 7
days ahead that is not taken yet. `k` names the dose (`day|medicine|slot`, and `|<ms>` for a dose put off with "Later"),
`d` + `hm` are its day and time on the phone's clock (`at` instead: a moment, for "Later"), `t` and `b` the notification's
title and text already in the family's language (time of day; the person's name and the medicine's words).
- The list is kept in SharedPreferences (`reminders`). One alarm at a time, for the next dose: `setExactAndAllowWhileIdle`
  when exact alarms are allowed (always before Android 12; on 12+ when **Alarms and reminders** is on for Sehat, off
  by default on Android 14+), otherwise `setAndAllowWhileIdle` (Android 6+: a few minutes late, but it still rings when
  the phone is asleep, where a plain `setWindow` could wait for hours) or `setWindow` (10 minutes, Android 5).
- When it rings: every dose due then that has not rung yet. App on the screen: no notification, the page shows its own
  spoken reminder (`sehatRemindNow`). Otherwise a notification in the channel "Medicine reminders" (high importance,
  sound, vibration; small icon `res/drawable/ic_stat_medicine.xml`, a white vector pill). A tap opens the app on
  `#/family` with the reminder. A dose that is taken or put off disappears from the list, and its notification from the
  phone.
- `ReminderReceiver` sets the alarm again after `BOOT_COMPLETED` (and `QUICKBOOT_POWERON`), `TIME_SET`,
  `TIMEZONE_CHANGED`, `MY_PACKAGE_REPLACED` and the exact-alarm permission changing. A dose's moment is worked out from
  its day and time in the phone's time zone of that moment, so after a time zone or clock change it rings at the time
  on the new clock. A dose missed while the phone was off still rings after the restart if its 3 hours are not over.
- Permissions: `POST_NOTIFICATIONS` (asked on Android 13+ when the first medicine with a time is saved, after the page
  says what it is for), `SCHEDULE_EXACT_ALARM` (not asked; without it reminders are a few minutes late),
  `RECEIVE_BOOT_COMPLETED`, `VIBRATE` (Android 7 and older).
- Test the plan without Android: `cd android && javac -d /tmp/rp app/src/main/java/org/sehat/app/ReminderPlan.java test/ReminderPlanTest.java && java -cp /tmp/rp org.sehat.app.ReminderPlanTest`.
- Phones that kill apps in the background (Xiaomi, Oppo, Vivo, Tecno, some Samsung): a reminder can be missed until
  Sehat is allowed to "Autostart" or its battery use is set to "No restrictions" in the phone's settings.
  Force-stopping the app clears its alarm until it is opened again.

### Share Sehat (`js/share.js`, route `#/share`)
The web app's **Share Sehat** screen (home card and Settings row) uses these calls: a Nearby button (`shareApp()`, the
Android share sheet with Quick Share and Bluetooth), one button per messaging app (`shareAppTo(pkg)`, greyed out when
`isInstalled(pkg)` is false), and an "Other apps" button. In a browser the same screen shares the web link and shows an
offline QR code.

## Getting the APK (no programming)
Every push to `main` (and the **Run workflow** button under **Actions → Android app**) builds a signed `sehat.apk`.
Download it from the repository's **Releases** page (one release per book version, tag `v<version>`), or from the
workflow run's **Artifacts**.

**Test builds:** Run workflow on any other branch (or `gh workflow run android.yml --ref <branch>`) first builds the
book from that branch (`tools/build.py`), then publishes a **pre-release** with tag `test-<version>`
(`.../releases/download/test-<version>/sehat.apk`). It is never marked "latest" and never touches the `v<version>`
releases families download; delete old test pre-releases from the Releases page when done.

### Signing secrets (one time)
The APK must always be signed with the same key (made once; kept in the private `android-signing` folder, not in
this repository). GitHub needs it as four "secrets":
1. On github.com open the repository, then **Settings** (top right of the repository) → **Secrets and variables** →
   **Actions** → **New repository secret**.
2. Add these four, one at a time (Name exactly as written; Secret = the value from `signing-secrets.txt`):
   - `ANDROID_KEYSTORE_BASE64`: open `sehat-release.jks.base64.txt`, select everything (it is one long line), copy, paste.
   - `ANDROID_KEYSTORE_PASSWORD`: the keystore password.
   - `ANDROID_KEY_ALIAS`: `sehat`
   - `ANDROID_KEY_PASSWORD`: the key password (the same as the keystore password).
3. Open **Actions → Android app → Run workflow**. After a few minutes the APK appears under **Releases**.

GitHub hides secrets after saving them; nobody can read them back, not even you. If a build says
"Signing secrets are missing", one of the four names is misspelled or empty.

## Installing a shared APK (what the receiving person does)
1. Receive `sehat.apk` (Bluetooth, Quick Share, Files by Google "Nearby share", ShareIt, WhatsApp...).
2. Tap the file (in the notification, or in Files → Downloads / Bluetooth).
3. Android says the app (Files, Bluetooth...) is not allowed to install unknown apps: tap **Settings**, turn on
   **Allow from this source**, go back, tap **Install**. On Android 7 and older: Settings → Security → **Unknown sources**.
4. Google Play Protect may warn about an unknown app: tap **More details → Install anyway** (or "Install without scanning").
5. Open صحت. Updates: install a newer `sehat.apk` the same way; records stay. (Uninstalling deletes the child records
   and recordings, as clearing a browser would.)

If Bluetooth on one phone does not offer to send `.apk` files, use Quick Share or Files by Google instead; they accept apps.

## Updates
- Book text from the online editor (`contentUrl`) still updates inside the app whenever the phone is online.
- Anything else (new js/css/pictures/built-in audio) needs a new APK: push to `main`, download the new `sehat.apk`,
  and pass it around again. `versionCode` = minutes since 2020 at build time, so every build is "newer";
  `versionName` = the book version in `content/version.json`.

## Differences from the browser version
- No "Add to home screen" banner (not needed; it hides itself).
- The phone's text-to-speech fallback (`speechSynthesis`) does not exist in the Android WebView; only recorded clips play.
- "Send recordings" opens the share sheet (WhatsApp, Bluetooth, Save to Drive/Files...) instead of downloading a file.
- Data (vaccine records, recordings, settings) is separate from any data the same person had in Chrome.
- Usage counts report platform `android` and `standalone: false`; the user agent ends with `FHBAndroid/<version>` if the
  server ever needs to tell app users apart.

## Building on a computer
Needs JDK 17+ and the Android SDK (Android Studio, or command-line tools with `platforms;android-36`).
```
cd android
./gradlew assembleRelease          # runs sync-web.sh first
```
For a signed build set `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
(environment variables, or in `~/.gradle/gradle.properties`); without them you get an unsigned APK. Never put the
keystore or passwords in this folder (`.gitignore` blocks `*.jks`, `*.keystore`, `keystore.properties`).
The output is `app/build/outputs/apk/release/app-release.apk`.
