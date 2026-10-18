# Written permissions for ASK sources

A source whose class in `content/sources.json` is **ASK** (Begum Academy, SOLAx, LEARN Afghanistan, Darakht-e
Danesh, Hesperian, the King Fahd Complex recitations) is treated exactly like a **LINK** source until a file here
says otherwise: link cards only, nothing copied. Free to watch is not free to copy.

One file per source, named by its id: `content/permissions/<id>.md`. The validator and the hub read the
`key: value` lines near the top; the rest is for people.

```
# Permission: solax

status: granted           (asked, granted or refused; only "granted" changes anything)
class: BUNDLE-NC          (what the permission lets Qalam do: BUNDLE, or BUNDLE-NC for non-commercial use only)
granted: 2027-01-20       (the date on the written permission)
scope: grade 7-9 maths lessons, Dari and Pashto, text and pictures, translated and shortened
credit: the wording the owner asked for, if any
kept: where the signed letter or email is kept (never in this repository)
```

Rules:

- Only a **written** permission counts, and it must name what may be copied and how it is credited. Keep the letter
  or email itself outside the repository; this file only records that it exists and what it allows.
- `class: BUNDLE-NC` puts the material only into packs marked `"licence": "NC"`.
- No personal details here: no names, phone numbers or addresses of the people who granted it, only the
  organisation.
- A file for a source that is not ASK, or a `granted` file without `class` and `granted`, is a problem in
  `tools/validate_pack.py`.

As of 16 October 2026 no permission has been granted. Begum Academy is ASK: link only, copy nothing.
