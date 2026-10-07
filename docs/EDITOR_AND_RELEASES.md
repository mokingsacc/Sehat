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
| `list:<name>` | one topic list in `book.sections`, whatever its name: `children`, `women`, `everyone`, `emergency`, `kit`, `safety`, `hospital`, `food`, `wellbeing` |
| `home` | the parts of the home screen |
| `ui:<key>` | one interface text |
| `say:<key>` | one spoken interface line (`ui.*`, `anim.*`) |
| `facilities` | the list of clinics and hospitals |
| `search:<key>` | the symptom finder's words for one page (`book.search.pages`) |

The editor keeps only the units it changed, and publishing sends only those, as the **overlay** (`/content/overlay.json`). Each unit carries two things:

- `base`: a short fingerprint of the app's version of that unit when the editor changed it.
- `ts`: the time the editor last saved that unit.

The phone lays the overlay over **its own** shipped book (`js/overlay.js`, `applyOverlay`). It uses a unit when either of these is true:

1. Its own copy of the unit still has the base fingerprint. The app has not changed that unit since the editor started, so the editor's version is the newest.
2. The editor saved the unit after this app was built (`ts > built`). The editor's change is newer than the release.

Otherwise the app release changed that unit after the editor did, so the phone keeps the app's version. The editor shows the same (see below).

As a result:

- **A release never hides the editor's other changes.** Every unit the release did not touch still comes from the overlay.
- **A publish never undoes a release's fixes.** Units the editor did not change are not in the overlay at all.

There are a few extra rules:

- The vaccine page (`topic:vaccines`) only changes with app releases.
- A topic that the Emergency screen opens is never deleted by an overlay.
- Lists drop topics that do not exist, and new spoken lines join the recording order and the right download pack.
- **Uploaded recordings** are tied to the text they were recorded for. The overlay sends each clip with a fingerprint of its text. If a later app release changes that text, the phone stops playing the old clip and falls back to the app's clip or the phone's speech.
- Settings shows the edition, which is the version of the overlay in use.

## The editor keeps only what it changed

The editor works the same way as the phones. The server keeps only the editor's changed units, one row each (table `edit_unit`), each with its `base` fingerprint and its save time `ts`. The editor page downloads the app's own book from the app's address (`APP_URL`) and lays the changes over it with the same `applyOverlay` the phones use. So:

- **The draft always starts from the app's newest book.** When the app is updated, the editor's changes are on top of the new version the next time the page opens. There is no "Bring in app changes" step any more.
- **Check for problems** and **Publish** first ask the app for its version. If it changed while the page was open, the page downloads the new book and lays the changes over it before it checks. Nothing to press.
- **Publish** also tells the server which app version it checked. If the server sees a newer one, it refuses once with that version. The page then brings it in, checks again and publishes.
- If the app changed a unit again after the editor changed it, phones show the app's version (the rules above). The editor shows the same, with a message naming those units. Changing the unit again makes the editor's version win.
- A topic the editor added stays in its list even when a later app release changes that list.
- What you see in the editor is what phones on the newest app will show.

### Why: the stale draft of 7 October 2026

Before this, the server kept a whole copy of the book as the draft, and **Bring in app changes** merged a new app book into it. Mo's draft was imported from app version 2026.10.07-f4ed63 (25 topics), before the server kept a base or save times. After content merge 2 (102 topics) he pressed **Bring in app changes**, and the check showed 73 errors like "The safety list names "home-safety", but there is no such topic".

The cause: with no base, the merge took every unit that differed from the app as an editor change. The 77 new topics were missing from the old draft, so the merge "kept" that, which deleted them. But the new lists (`safety`, `hospital`, `food`, `wellbeing`) and the Emergency screen were not units, so they came from the new app and still named those topics. `tools/test_editor.mjs` rebuilds this with the real older servers from git.

Now the draft cannot drift from the app, because it is never stored as a whole book. Every topic list in `book.sections` is a unit. And an old draft is only read once, as described below.

## The editor's steps

- **Edit**: each change is saved a moment after typing stops, as the units it touched (`save`). A unit that is the same as the app's own again is dropped, so it follows the app from then on.
- **Two windows or two people**: each save says which save time of each unit it started from. A save made on an older copy of the same unit is refused with a message to reload, so no change is lost without warning (M7). Changes to different units do not get in each other's way.
- **Publish**: the server checks each changed unit (each unit's check is made when it is saved), then writes the overlay from the stored rows. It never reads the whole book.
- **Revert draft**: the changes go back to what was published last.
- **Start again from the app**: throws away all changes. Uploaded recordings are kept.

## Older phones and older drafts

- **Phones with an app from before the overlay** (before the evening of 7 October 2026) read the whole published book, `/content/book.json`. The server no longer writes it. It keeps serving the last one written, and those phones get the overlay once their app updates.
- **A draft kept the old way** (the rows `draft` and `base` in the table `content`) is moved over once, the first time an editor opens the page (`moveOld` in the page, `CORE.oldChanges`). Units with a save time are the editor's changes and move over. The other units that differ from the app have no save time. They are mostly the app's older text, so they are not used, and the Publish page lists them with **Keep them as my changes** and **Forget them**. A unit missing from the old draft is one the app added later. It never removes the app's page, unless the editor had deleted that topic (its id is in `retired`). The old rows are left in place.

## For people changing the code

- `js/overlay.js` is shared by the app, the server and the editor page. Its code sits inside `overlayCore()`, which uses nothing from outside itself, so the server can send it to the editor page as text. Keep it plain ES2018 for old phones. A change there also redeploys the server.
- `server/editor-core.js` holds the editor's rules (the check, the spoken lines, the recording order, what a saved unit may contain). It is used by the server and sent to the editor page the same way. Keep it self-contained too.
- A new kind of content outside these units (for example a new top-level book field that editors can change) needs a unit kind in `unitKeys`, `getUnit` and `setUnit`, and a rule in `cleanUnit`. Otherwise editor changes to it are not saved.
- `tools/build.py` versions the book by a hash of its content, not by the build time (L10). Rebuilding the same content keeps the same `version` and `built`, so phones do not download an update that changes nothing, and `built` only moves forward when the release really changes.
- **Computer time.** The free Cloudflare plan allows about 10 ms of computer time for each request. The book is about 2.2 MB, and reading or writing it whole takes more than that. So no editor request reads, parses or writes the whole book. Each request handles only the units it changes, and the page does the work that needs the whole book. `node tools/test_editor.mjs` measures each request on the real book and fails if one takes 10 ms or more. Moving an old draft over is sent about 25,000 characters at a time for the same reason.
- D1 holds at most 2 MB in one row. A big overlay is kept in pieces of at most 600,000 characters (`writeDoc` in `server/worker.js`).
  - The row `<name>` starts with `~pieces:<id>:<n>`, and the rows `<name>#<id>#1`, `#2` and so on hold the rest.
  - The pieces are written before the row that points to them, under a new id each time. So nobody ever reads half a save. Pieces from older saves are deleted afterwards.
  - Always read a stored text with `docBody`, never by selecting `body` directly.
