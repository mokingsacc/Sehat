# Editor publishes and app releases

The book reaches phones in two ways:

- **App releases.** `tools/build.py` builds `content/book.json`, and the web app and the Android app ship with it.
- **Editor publishes.** Someone changes the book in `/admin` on the server and presses **Publish**. Phones fetch the change the next time they are online.

Before October 2026, a phone used whichever whole book was newer by build time. So an app release hid every editor change, and the next publish undid every fix in that release (audit finding H2). This page explains how the two now work together.

## The idea: the editor sends only what it changed

The book is split into **units**. Each unit is replaced as a whole:

| unit | what it is |
|---|---|
| `topic:<id>` | one topic page, with its spoken lines |
| `list:<name>` | one topic list: `children`, `women`, `everyone`, `kit` or `emergency` |
| `home` | the parts of the home screen |
| `ui:<key>` | one interface text |
| `say:<key>` | one spoken interface line (`ui.*`, `anim.*`) |
| `facilities` | the list of clinics and hospitals |
| `search:<key>` | the symptom finder's words for one page (`book.search.pages`) |

When the editor publishes, the server compares the draft with the **base**, which is the app book the draft was imported from. Only the units that differ go into the **overlay** (`/content/overlay.json`). Each unit carries two things:

- `base`: a short fingerprint of that unit as it was in the base app book.
- `ts`: the time the editor last saved that unit.

The phone lays the overlay over **its own** shipped book (`js/overlay.js`, `applyOverlay`). It uses a unit when either of these is true:

1. Its own copy of the unit still has the base fingerprint. The app has not changed that unit since the editor started, so the editor's version is the newest.
2. The editor saved the unit after this app was built (`ts > built`). The editor's change is newer than the release.

Otherwise the app release changed that unit after the editor did, so the phone keeps the app's version. The skipped unit is listed in the result, and in the editor's publish warning.

As a result:

- **A release never hides the editor's other changes.** Every unit the release did not touch still comes from the overlay.
- **A publish never undoes a release's fixes.** Units the editor did not change are not in the overlay at all.

There are a few extra rules:

- The vaccine page (`topic:vaccines`) only changes with app releases.
- A topic that the Emergency screen opens is never deleted by an overlay.
- Lists drop topics that do not exist, and new spoken lines join the recording order and the right download pack.
- **Uploaded recordings** are tied to the text they were recorded for. The overlay sends each clip with a fingerprint of its text. If a later app release changes that text, the phone stops playing the old clip and falls back to the app's clip or the phone's speech.
- Settings shows the edition, which is the version of the overlay in use.

## The editor's steps

- **Import from app**: copies the app's book into the draft and saves it as the base.
- **Edit**: each save records which units changed and when (`edits`). If two people, or two windows, edit at the same time, the server accepts only saves made on the newest draft. A save from an out-of-date window is refused with a message to reload, so no change is lost without warning (M7).
- **Publish**: makes the overlay and the whole published book.
- **Bring in app changes**: appears in a banner and on the Publish tab when the app has a newer version than the draft's base. It takes the new app book. Units the editor never changed take the app's new text. Units the editor changed keep the editor's text, and the result lists them. Units that both sides changed are listed separately so someone can check them. After this, the base is the new app book.

## Older phones and older drafts

- **Phones with an app from before this change** still read the whole published book (`/content/book.json`), as before. They update to the new app with the next release. After that they use the overlay.
- **A draft imported before this change** has no base. On its first publish, the server takes the app's book as it is at that moment as the base. Units that differ are sent with no save time. So phones running that app release use them, and a later app release that changes the same unit wins. **Bring in app changes** on such a draft keeps every unit that differs from the app, because nobody can tell who changed it. The list it shows is worth a quick look.
- Once the new server is deployed, press **Publish** once. Phones on the new app then get an overlay.

## For people changing the code

- `js/overlay.js` is shared by the app and the server (`server/worker.js` imports it, so a change there also redeploys the server). Keep it plain ES2018 for old phones.
- A new kind of content outside these units (for example a new top-level book field that editors can change) needs a unit kind in `unitKeys`, `getUnit` and `setUnit`. Otherwise editor changes to it are not sent.
- `tools/build.py` versions the book by a hash of its content, not by the build time (L10). Rebuilding the same content keeps the same `version` and `built`, so phones do not download an update that changes nothing, and `built` only moves forward when the release really changes.
- The server keeps each book (draft, base, published, overlay) in the D1 table `content`. D1 holds at most 2 MB in one row, and the book is bigger than that since content merge 2 (about 2.2 MB). So `writeDoc` in `server/worker.js` splits a big book into pieces of at most 600,000 characters.
  - The row `<name>` starts with `~pieces:<id>:<n>`, and the rows `<name>#<id>#1`, `#2` and so on hold the rest.
  - The pieces are written before the row that points to them, under a new id each time. So nobody ever reads half a save. Pieces from older or refused saves are deleted afterwards.
  - The whole book may be up to 8 MB. Always read a stored book with `getDoc` or `docBody`, never by selecting `body` directly.
