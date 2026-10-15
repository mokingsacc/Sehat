# The talking guide

Many of the families Sehat is for cannot read, so the app talks them through itself (Mo, 14 Oct 2026).

## First run (js/app.js: screenWelcome, screenHello)

1. **Language.** Only the logo, the name and a big speaker, with two big buttons: Dari (blue) and Pashto (yellow).
   Two seconds after the screen opens, a woman's voice says `ui.onb.lang` in Pashto ("for Pashto, press the yellow
   button"), then in Dari ("choose your language: for Dari, press the blue button"), lighting each button as it is
   named (Pashto first: Mo, 15 Oct 2026).
2. **What Sehat is** (`#/hello`). It speaks by itself: `ui.onb.about`, `ui.onb.help`, `ui.onb.talk`, `ui.onb.keep`
   (website only: the yellow "Keep Sehat on my phone" button, the phone's own install), `ui.onb.net` (keep the internet
   on so the voices save) and `ui.onb.next` (press the blue button). Next opens the Health tab.

Colours: red is only ever Emergency. In Pashto "shin" (شین) means both blue and green, so the welcome uses blue and
yellow, and the Pashto lines say blue as "blue like the sky" (and green, on the Health tab, as "green like the grass").

Sound: a phone's browser plays nothing before the first touch. When the first clip is refused (`P.blocked`), the
speaker pulses and the next touch outside a button starts the voice. The Android app's WebView plays at once
(`setMediaPlaybackRequiresUserGesture(false)` in MainActivity), and so does a website added to the home screen.

The welcome clips are in `book.bundle` (tools/build.py), so the Android app carries them in the woman's voice of Dari
and Pashto: a phone that gets the app by Bluetooth hears them with no internet. Mo asked for these lines in the woman's
voice only; a phone set to the man's voice plays the woman's clip (js/app.js plays the other voice when one is missing).

Settings has "Hear the welcome again" (`#/hello`), for someone helping a new user.

## Every page (js/app.js: pageSay, sayPage)

Opening a page says its name. The first 2 times a page is opened it also says one line on what it is for, then
`ui.intro.more` ("press the speaker next to any part to hear more"). Visits are counted per page in `fhb.seen`.
Opening the app speaks only for a page's first 2 visits (not its name every time). Tapping the tab you are on says the
whole intro again. Settings has a switch (`fhb.autoSay`) to turn it off. Pages in the Emergency flow keep their own
words. While a page is speaking, the district question waits for it to end.

| Page | First 2 visits | After that |
| --- | --- | --- |
| Health tab | `ui.tab.health`, `ui.intro.health` | `ui.tab.health` |
| Home tab | `ui.house` | `ui.tab.house` |
| Family tab | `ui.tab.family`, `ui.intro.family` | `ui.tab.family` |
| Children, Adults | `ui.intro.children`, `ui.adults` | `ui.name.children`, `ui.name.adults` |
| CPR and first aid, What is wrong?, the lists | their own line (`ui.cprFirstAid`, `ui.ask`, `config.lists[x].say`) | `ui.name.<x>` |
| Share, feedback | `ui.share-app` or `ui.share-web`, `ui.feedback` | `ui.name.share`, `ui.name.feedback` |
| A topic | `<id>.title`, `<id>.summary` | `<id>.title` |

## Colours of the big buttons (js/app.js: COLOURS; css/app.css: .col, .c-*)

Each big button on the Health and Home tabs has its own colour, so the voice can name it; no two on one tab share one.

- Health: Emergency red, CPR and first aid orange, What is wrong? purple, Children blue, Adults green, Early signs and
  health checks yellow, Going to the clinic or hospital brown.
- Home: Share Sehat pink, Your ideas brown, Home safety orange, Food and garden green, Food that helps yellow,
  Well-being purple, Home health kit blue.
