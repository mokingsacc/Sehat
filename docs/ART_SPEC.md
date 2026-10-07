# Family Health Book: art spec

The app is a narrated, offline family health book for villages in Samangan province, northern Afghanistan (Dari and Pashto speakers). The owner asked for "beautiful pictures". Pictures carry meaning for people who cannot read, so every picture must be instantly clear on a small, cheap phone screen.

## Palette (match the app)
- red-book red #B6322D (dark #8E2622, tint #F7E3E1) for children and danger
- teal #1F6F7A (dark #155058, tint #DDEFF2) for adults
- warm white ground #FBFAF7, ink #22201D, muted #6B655E, line #E6E1D8
- green #2E7D4F (good/do), amber #B8860B (tint #FBF0D2) for "soon"
- skin tones: #E9B894, #D9A27A, #C68B62 ; hair #3B2A22 ; earth and mud-brick #D8B98F / #C49A6C ; mountains #BFCBC9 / #9FB2B0 ; sky #EAF3F4

## Style
Flat vector, soft rounded shapes, no outlines or thin dark outlines only, 2 to 3 shades per object, gentle shadows as flat shapes, no gradients except a soft sky. Calm and dignified, never scary or gory. People are simple but warm (dot eyes, small smile or neutral). No text or letters inside pictures (except "ORS" on a sachet is allowed).

Culture: rural northern Afghanistan. Women wear a long dress and a large head scarf (chador) covering hair, in muted colours; men wear perahan tunban with a waistcoat, and a pakol or a turban or a cap; children in simple clothes; grandparents with white hair/beard. Mud-brick houses with flat roofs, wooden doors, a tandoor, a courtyard with a tree, dry hills and snowy mountains behind. Health workers: a female health worker in a white coat over her scarf; a male doctor in a white coat. Clinic and hospital buildings show a red crescent (never a cross). Modesty: breastfeeding shown with the baby wrapped and the mother's scarf covering; pregnancy shown by a rounded belly under the dress; no bare bodies.

## Files to produce
1. Topic hero pictures: img/topics/<id>.svg, viewBox="0 0 360 200", a full scene with background. Ids:
   vaccines, danger-child, newborn, breastfeeding, diarrhoea, cough, fever, growth, first-aid,
   pregnancy-danger, pregnancy-care, after-birth, anaemia,
   red-flags, tb, blood-pressure, diabetes, stress, hygiene
   plus two generic fallbacks: children-generic, adults-generic.
2. Home and section pictures: img/app/home-children.svg and img/app/home-adults.svg (viewBox 0 0 320 180, the big cards on the home screen: a mother with a small child; a man and a woman), img/app/welcome.svg (viewBox 0 0 360 240, a family in front of a mud-brick house with Samangan's hills, used on the first screen where people pick Dari or Pashto).
3. App icon: img/app/icon.svg (viewBox 0 0 512 512, full-bleed red #B6322D square background, a simple white book with a small heart or a mother-and-child shape; must still read at 48 px and survive a circular crop, keep the motif inside the central 60 %).
4. Icons: img/icons/<name>.svg for every name in the icon list in CONTENT_SPEC.md ("Icons" section). viewBox="0 0 48 48", single colour using fill="currentColor" and/or stroke="currentColor" (no other colours) so the app can tint them red, teal or amber. Bold and simple: readable at 28 px. Prefer adapting Health Icons (made by Resolve to Save Lives for global health, MIT licence). The full set is already downloaded and extracted at /tmp/claude-0/-home-claude/cf02bd27-4cc9-5cad-8982-bd4836e19e3c/scratchpad/vendor/healthicons-pkg/package/public/icons/svg/ (folders filled/, outline/, filled-24px/, outline-24px/, each split by category such as people, conditions, body, medications, places, objects, nutrition, zoonoses). Do not install any packages; everything you need is already on disk. Normalise each adapted icon to the 48 viewBox and currentColor. Draw any icon that Health Icons lacks in the same weight.

## Quality bar
Render everything to PNG with Playwright (Chromium is preinstalled; `const { chromium } = require('playwright')` works from /opt/node22 global modules, set NODE_PATH=/opt/node22/lib/node_modules) and look at it with your image-reading tool. Fix anything unclear, ugly, mis-scaled, or culturally wrong. Produce contact sheets: img/_preview/topics.png, img/_preview/icons.png (icons at 28 px and 48 px, in red and teal), img/_preview/app.png.

Keep each SVG small (topic scenes under ~12 KB, icons under ~2 KB), no embedded raster images, no external references, no <text> elements except "ORS". Write a short img/CREDITS.md listing which icons came from Health Icons and which were drawn new, and copy in the Health Icons MIT licence text (from the LICENSE file in the package folder above), which must ship with the app.
