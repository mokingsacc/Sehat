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
  `content/book.json`, `content/version.json` and `audio/` (when it has clips). Run `python3 tools/build.py` first, as usual.
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

### Share Sehat (`js/share.js`, route `#/share`)
The web app's **Share Sehat** screen (home card and Settings row) uses these calls: a Nearby button (`shareApp()`, the
Android share sheet with Quick Share and Bluetooth), one button per messaging app (`shareAppTo(pkg)`, greyed out when
`isInstalled(pkg)` is false), and an "Other apps" button. In a browser the same screen shares the web link and shows an
offline QR code.

## Getting the APK (no programming)
Every push to `main` (and the **Run workflow** button under **Actions → Android app**) builds a signed `sehat.apk`.
Download it from the repository's **Releases** page (one release per book version, tag `v<version>`), or from the
workflow run's **Artifacts**.

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
