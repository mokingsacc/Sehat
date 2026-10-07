# Home health kit, breathing counter and reading checker

This document is for Mo and for anyone who changes these features. It lists the sources, every number the app uses, the judgement calls Claude made, and notes on buying the devices. Nothing here is a diagnosis. Every result tells people when to see a health worker and what the clinic will do.

## What was built

| Feature | Where | Files |
| --- | --- | --- |
| Fever by touch: back of the hand on the chest, belly or neck; "fever earlier counts"; thermometer under the arm; link to the thermometer page | Fever topic | `content/src/topics/fever.json`, `img/pics/fever-touch.svg` |
| Breathing counter: choose the age, narrated steps, big tap button, 60-second timer with a chime and vibration, colour-coded result, danger-sign check with a chest-indrawing picture | Home card, `#/tool/breaths`; link blocks in Cough and Danger signs in children | `js/tools.js`, `img/pics/breath-watch.svg`, `img/pics/chest-indrawing.svg` |
| Home health kit section: 8 topics (what to buy, thermometer, BP machine, MUAC tape, sugar meter, oxygen clip, baby scale, first-aid box) | Home card, `#/kit` | `content/src/topics/kit-*.json`, `content/src/sections.json` ("kit"), `img/topics/kit-*.svg`, `img/pics/bp-sit.svg` |
| "What does the number mean?" checker: device, person, number, signs, then a colour-coded meaning, what to do, what the clinic will do, all with speaker buttons | Home card, `#/tool/reading`; a link block on each device page (`#/tool/reading/<device>`) | `js/tools.js` |

New content features used by the above, so other writers can use them too:

- **`link` block**: `{"id","type":"link","to","icon","title","text"}`. `to` is `tool/breaths`, `tool/reading`, `tool/reading/<temp|bp|sugar|spo2|muac>`, `topic/<id>`, `kit`, `family` or `near`. It is narrated like a step (title, then text).
- **`picture` on a `step` or `link` block**: the name of a file in `img/pics/` (without `.svg`). It shows a wide picture under the step.
- **`kit` section** in `sections.json`: topics listed there are shown only in the kit page, not in the children or adults lists.

Result colours (level, label): `urgent` red "Hospital now"; `today` amber "Clinic today"; `soon` light amber "Clinic this week"; `watch` teal "Care at home and watch"; `ok` green "Normal"; `check` grey "Measure again". Any danger sign the person ticks makes the result red whatever the number. The checker records only the device, the person and the colour (when usage counting is on); it never stores or sends the number.

## Sources

| Short name | Source | Used for |
| --- | --- | --- |
| IMCI 2014 | WHO/UNICEF Integrated Management of Childhood Illness chart booklet (2014) and IMCI computerised adaptation; WHO Pocket book of hospital care for children (2013) | Fast breathing cut-offs, chest indrawing, general danger signs, "feels hot or history of fever", young infant temperature (37.5 or more, under 35.5) |
| WHO thermal 1997 | WHO Thermal protection of the newborn: a practical guide (1997) | Newborn normal 36.5 to 37.5; 36.0 to 36.4 cold stress (rewarm, skin to skin); under 36 moderate, under 32 severe hypothermia |
| NICE NG143 | NICE Fever in under 5s (2019, updated 2021) | Any fever 38 or more under 3 months = high risk; axillary electronic thermometer under 4 weeks; feeling hot is unreliable but parental report counts |
| WHO ANC 2016 / PCPNC | WHO recommendations on antenatal care (2016); Pregnancy, Childbirth, Postpartum and Newborn Care (PCPNC, 2015) | Fever in pregnancy, BP at every visit, pre-eclampsia danger signs |
| ISH 2020 | International Society of Hypertension Global Hypertension Practice Guidelines (Unger et al., Hypertension 2020) | Home BP 135/85 or more = high; measurement conditions (rest, two readings, cuff, arm at heart level) |
| NICE NG136 | NICE Hypertension in adults (2019, updated 2023) | Home average 135/85; 180/120 or more = same-day assessment; validated upper-arm devices |
| NICE NG133 | NICE Hypertension in pregnancy (2019, updated 2023) | 140/90 = hypertension, 160/110 = severe; pre-eclampsia symptoms |
| WHO HEARTS | WHO HEARTS technical package (2018, 2020), HEARTS-D diabetes module (2020), WHO PEN (2020); WHO technical specifications for automated BP devices (2020) | Validated automated upper-arm devices, cuff sizes, home monitoring, diabetes self-testing for people on insulin or sulfonylureas |
| ADA 2025 | American Diabetes Association Standards of Care in Diabetes 2025, sections 6 and 7 | Hypoglycaemia level 1 (under 70 mg/dL) and level 2 (under 54 mg/dL); the 15 g / 15 minutes rule; targets 80 to 130 fasting, under 180 after meals |
| WHO SAM 2013 | WHO Guideline: updates on the management of severe acute malnutrition in infants and children (2013); WHO/UNICEF joint statement on MUAC (2009) | MUAC under 115 mm (red) = severe acute malnutrition; 115 to 124 mm (yellow) = moderate; bilateral pitting oedema = severe |
| WHO O2 2016 | WHO Oxygen therapy for children (2016); WHO Pocket book of hospital care for children (2013) | SpO2 under 90 = give oxygen |
| NHS oximetry | NHS England COVID oximetry at home (2020-2022) and NHS patient guidance on pulse oximeters | 95 or more normal; 93 to 94 = urgent advice; 92 or less = emergency |
| FDA 2021/2025 | US FDA safety communication on pulse oximeter accuracy (2021) and draft guidance (2025); Sjoding et al., NEJM 2020 | Oximeters can over-read in darker skin; cold hands, nail polish or henna, movement |
| NICE NG75 | NICE Faltering growth (2017) | Baby weighing: same scale, no clothes or same light clothes, not too often |
| Facts for Life | UNICEF/WHO Facts for Life (4th ed., 2010) | First-aid box: ORS, zinc, soap, clean cloth |
| Validated devices | validatebp.org (Hypertension Canada / AAMI / ISH list) and STRIDE BP (stridebp.org) | Buying a clinically tested BP machine |

Links to these documents were not opened from this build environment: check they still resolve before quoting them publicly.

## Every number the app uses

### Breathing counter (`#/tool/breaths`, `BR_AGES` in `js/tools.js`)

| Age | Fast breathing from | Result if fast | Very slow (count again) | Source |
| --- | --- | --- | --- | --- |
| Under 2 months | 60 or more | Hospital now (red) | under 30 | IMCI 2014: fast breathing in a young infant = severe disease |
| 2 to 12 months | 50 or more | Clinic today (amber) | under 20 | IMCI 2014: pneumonia, oral amoxicillin |
| 1 to 5 years | 40 or more | Clinic today (amber) | under 15 | IMCI 2014 |
| Over 5 years and adults (optional) | 30 or more | Clinic today; 40 or more = hospital now | under 10 | Judgement call (see below) |

Danger signs always shown after the count; any one ticked = hospital now: chest indrawing (with the picture), noisy breathing at rest (stridor), cannot drink or breastfeed, vomits everything, fits, very sleepy or hard to wake. Under 2 months: severe chest indrawing, not feeding well, fits, moves only when touched, too hot or too cold. Adults: very hard to breathe, blue lips, confused, chest pain.

### Temperature (`verdictTemp`)

A number from 86 to 111 is taken as Fahrenheit and converted (the result shows both). Valid range 30 to 43.5 °C.

| Person | Reading (°C, under the arm) | Result |
| --- | --- | --- |
| Baby under 3 months | 37.5 or more | Hospital now |
| | under 35.5 | Hospital now (skin to skin on the way) |
| | 35.5 to 36.4 | Clinic today: skin to skin, cover the head, measure again in 1 hour |
| | 36.5 to 37.4 | Normal |
| Child 3 months to 5 years | 37.5 to 38.9 | Care at home and watch (drinks, back if over 2 days or very ill) |
| | 39 or more | Clinic today |
| Older child or adult | 37.5 to 39.4 | Care at home and watch |
| | 39.5 or more | Clinic today |
| Pregnant woman | 37.5 or more | Clinic today |
| Everyone except young babies | 41 or more | Hospital now |
| | under 35 | Hospital now |
| | 35 to 35.9 | Care at home: check the thermometer was deep under the arm, warm, measure again in 30 minutes |

### Blood pressure (`verdictBp`)

Two numbers; the top must be bigger than the bottom. Valid range top 50 to 300, bottom 25 to 200. "Or" means either number.

| Person | Reading | Result |
| --- | --- | --- |
| Adult | 180/120 or more | Hospital now (the advice says sit 5 minutes and measure once more first) |
| | 135/85 to 179/119 | Clinic this week (rest, measure again; keep taking medicine) |
| | top under 90 with dizziness or fainting | Clinic today (lie down, legs up, water; fainting again or confused = hospital) |
| | top under 90, feels well | Care at home (tell the clinic if on BP medicine) |
| | normal number but dizzy or fainting | Clinic today |
| | under 135/85 | Normal |
| Pregnant woman | 160/110 or more | Hospital now (possible pre-eclampsia) |
| | 140/90 or more with swelling of face, hands or legs | Hospital now |
| | 140/90 or more without signs | Clinic today |
| | under 140/90 but swelling or fainting | Clinic today |
| | under 140/90 | Normal (check at every visit) |
| Anyone | chest pain, face drooping, weak arm or leg, trouble speaking, very bad headache, breathless, confused; in pregnancy bad headache or blurred vision, fits, belly pain, breathless | Hospital now, whatever the number |

### Blood sugar (`verdictSugar`)

The person picks mg/dL (default) or mmol/L; mmol/L is multiplied by 18. "HI" counts as 600 and "LO" as 20. Valid range 10 to 700 mg/dL.

| Reading (mg/dL) | mmol/L | Result |
| --- | --- | --- |
| under 54, or LO | under 3.0 | Hospital now: give sugar first if they can swallow (3 teaspoons in water, then food) |
| 54 to 69 | 3.0 to 3.8 | Clinic today: give sugar, measure again in 15 minutes |
| 70 to 180 | 3.9 to 10.0 | Good range |
| 181 to 249 | 10.1 to 13.8 | Clinic this week if most readings are like this |
| 250 to 399 | 13.9 to 22.1 | Clinic today (hospital if vomiting, very sleepy, fast deep breathing) |
| 400 or more, or HI | 22.2 or more | Hospital now |
| any, with confusion or fits | | Hospital now (nothing by mouth if they cannot swallow) |
| any, with vomiting or fast deep breathing | | Hospital now |

The topic page teaches 80 to 130 before breakfast as the target (ADA), and mmol/L equivalents (under 4 low, 4.4 to 7.2 good, over 14 very high).

### Oxygen (`verdictSpo2`)

| Reading (%) | Result |
| --- | --- |
| 95 to 100 | Normal, but a normal number does not rule out illness |
| 93 to 94 | Clinic today if it stays there or the person is unwell (warm the hand, keep still, measure again) |
| 92 or less | Hospital now |
| any, with very hard breathing, blue lips, confusion, chest pain (adult) or chest indrawing, blue lips, very sleepy, cannot drink (child under 5) | Hospital now |

For children under 5 the result adds: adult clips often do not work on small children; count the breaths and look for chest indrawing as well.

### MUAC tape (`verdictMuac`)

Colour, not a number (children 6 to 59 months, left upper arm, halfway between shoulder and elbow).

| Colour | Cut-off on standard tapes | Result |
| --- | --- | --- |
| Red | under 115 mm | Clinic or nutrition centre today |
| Yellow | 115 to 124 mm | Clinic this week |
| Green | 125 mm or more | Good, measure again next month |
| any colour, with swelling of both feet, will not eat, very sleepy, fits | | Hospital now |

### Fever by touch (`fever.json`)

- Back of the hand (or cheek) on the chest, belly or neck, compared with your own skin. Not the hands or feet. IMCI counts "feels hot" or "history of fever" as fever, so "fever earlier in this illness counts".
- A baby under 2 months who feels cold to touch is a new hospital-now item (`fever.urgent.cold`), from IMCI "low body temperature".
- If you have a thermometer: under the arm, 37.5 °C or more is a fever (IMCI).

## Judgement calls for Mo

1. **Fast breathing at 2 to 59 months is amber (clinic today) in the counter, following IMCI.** The existing items `cough.urgent.breathing` and `danger-child.urgent.breathing` say "hospital now" for fast breathing. The two now disagree. Recommend changing those two items to "clinic today" unless there is chest indrawing or a danger sign, or making the counter red. A review note is in both topics.
2. **Fast breathing under 2 months is red (hospital now),** as IMCI classes it as possible serious bacterial infection.
3. **Older children and adults (optional age):** 30 or more = clinic today, 40 or more = hospital now. No single WHO cut-off exists for families. Age 5 to 12 normal is about 20 to 30; adult NEWS2 scores 21 to 24 as 2 and 25 or more as 3. 30 was chosen to be simple and safe. Mo may prefer to remove the adult option.
4. **Very slow breathing** (under 30, 20, 15 and 10 for the four ages) gives "count again", then "hospital now" if it is really that slow. This is mostly there to catch miscounting.
5. **Temperature under 3 months:** any 37.5 or more = hospital now (Mo's rule plus IMCI 37.5; NICE uses 38). 35.5 to 36.4 is "rewarm and recheck in 1 hour, clinic today if still low" (WHO thermal protection says cold stress). Under 35.5 = hospital (IMCI).
6. **Fever in older children and adults:** child 39 or more = clinic today, older child or adult 39.5 or more = clinic today, 41 or more = hospital now. These numbers are judgement calls: IMCI does not grade fever height and NICE uses traffic lights on signs, not on height (except under 6 months). Fever lasting more than 2 days = clinic (IMCI return advice).
7. **Fever in pregnancy = clinic today** whatever the number (PCPNC treats fever as needing assessment).
8. **Adult BP 180/120 = hospital now after one repeat,** as Mo asked. NICE says same-day assessment and allows clinic review when there are no symptoms. In rural Samangan, the nearest place for a same-day check may be the hospital. Mo to confirm.
9. **Adult home BP 135/85 to 179/119 = clinic this week.** One raised home reading does not diagnose hypertension; the advice says rest, measure again, and bring readings.
10. **Low BP:** top number under 90 with dizziness or fainting = clinic today. There is no international lay threshold; 90 systolic is the usual clinical cut-off.
11. **Pregnancy BP** follows the brief: 140/90 = clinic today; 160/110, or 140/90 with headache, vision change or swelling = hospital now. Swelling alone with normal BP = clinic today. The headache and vision signs are in the tick list (red whatever the number).
12. **Sugar under 54 (ADA level 2) = hospital now, even if they feel better after sugar.** Many people in Afghanistan take glibenclamide, which can make the sugar fall again for many hours. Under 70 = give 3 teaspoons of sugar (about 15 g, the ADA 15-15 rule) and clinic today. Mo may prefer under 54 as "clinic today" if the person recovers fully.
13. **High sugar bands** (181 to 249 this week, 250 to 399 today, 400 or HI hospital) are judgement calls. ADA and WHO do not give lay cut-offs. Most meters show HI above 500 or 600 mg/dL.
14. **mg/dL is assumed to be the usual unit in Afghanistan** (meters sold in Afghanistan mostly come from Pakistan, Iran and India, which use mg/dL). The checker offers mmol/L as well.
15. **Oxygen: 92 or less = hospital now, 93 to 94 = clinic today (NHS home oximetry).** WHO gives oxygen under 90. Samangan is about 900 m (Aybak) to 2,000 m or more in the hills; healthy people at 2,000 m can read 93 to 95. No altitude adjustment was made. The page warns about darker skin, cold hands, movement, nail polish and henna.
16. **MUAC red = clinic or nutrition centre today** (WHO SAM). The existing item `growth.urgent.thin` says "very thin and weak = hospital now". Uncomplicated SAM is treated as an outpatient (OTP), so the two differ. Swelling of both feet, not eating, very sleepy or fits = hospital now in both places.
17. **Baby scale page** is optional; Mo may remove it. It says weigh no more than once a month, use the same scale, and that clinics should decide if a baby is growing well.
18. **Fever by touch:** "Feel the chest, belly or neck with the back of your hand" replaces the old text of `fever.check`. The narration id is the same, so the existing recording of `fever.check` must be re-recorded.
19. **Prices are estimates** (see below). Prices in Samangan bazaars may differ and change with the exchange rate.
20. **Chair in the BP picture:** many homes sit on the floor. The page says sit with the back supported and feet flat, and the arm resting at heart level. A cushion on the floor against a wall also works. Check that people understand the picture.

## Buying notes

Prices are rough estimates for Aybak or Mazar-i-Sharif pharmacies in 2026, at about 70 afghanis to 1 US dollar. They have not been checked in a local bazaar.

| Item | Rough price (AFN) | About (USD) | What to look for | What to avoid |
| --- | --- | --- | --- | --- |
| Digital thermometer | 100 to 250 | 1.5 to 3.5 | Digital stick, beeps when done, spare battery | Mercury glass (breaks, poisonous); forehead strips; cheap infrared guns that read low |
| Upper-arm BP machine | 1,500 to 3,000 | 20 to 45 | Automatic, upper-arm cuff, clinically validated (check validatebp.org or STRIDE BP); cuff size printed on it (standard 22 to 32 cm, large 32 to 42 cm) | Wrist and finger machines; unbranded machines with no validation |
| MUAC tape | often free from the clinic or nutrition programme | | Three colours (red, yellow, green), for 6 to 59 months | Adult MUAC tapes (different cut-offs) |
| Sugar meter | 1,000 to 2,000, strips extra (often 1,000 or more for 50) | 15 to 30 | Strips that are easy to find locally; shows mg/dL; a meter the clinic knows | Buying if not diabetic; expired or open strips |
| Oxygen clip | 700 to 1,500 | 10 to 20 | Fingertip clip with a clear display and a pulse wave | Phone apps or smart watches as a replacement; trusting it for small children |
| Baby scale | 1,000 to 2,000 | 15 to 30 | Flat digital baby scale, 10 g or 20 g steps | Bathroom scales for babies |
| First-aid basics | 200 to 500 for the set | 3 to 7 | ORS packets, zinc tablets (for children's diarrhoea), clean cloth, bandages, soap; paracetamol only as the clinic advises | Antibiotics "just in case" |

## Narration to record

New narration ids (all are in `content/scripts/narration-*.tsv` after `tools/build.py`):

- All blocks and items of the 8 `kit-*` topics.
- `fever.check` (changed text), `fever.before`, `fever.thermometer`, `fever.kit`, `fever.urgent.cold`; `cough.counter`; `danger-child.counter`.
- 83 `ui.*` entries: `ui.breaths`, `ui.reading`, `ui.kit`, `ui.br.*`, `ui.who.*`, `ui.rd.*`.

The sign chips in the tools reuse narration ids from existing topics (for example `danger-child.urgent.chest`, `pregnancy-danger.urgent.headache`), so those recordings are shared.

## Testing

`tools/validate.py` and `tools/build.py` pass. The flows were driven in Chromium at phone size (390 x 844) in Dari, Pashto and English with a fake clock. The checks covered:

- the 2 to 12 month breathing count (55 = clinic today) and the under 2 month count (64 = hospital now);
- pregnancy BP 148/96 with swelling (hospital now) and adult BP 150/95 (clinic this week);
- a baby under 3 months at 37.8 (hospital now) and a child at 101.3 °F (converted to 38.5, care at home);
- sugar 3.1 mmol/L (clinic today) and HI (hospital now);
- oxygen 93 in a child under 5 (clinic today) and a red MUAC (clinic today);
- the cough link to the counter and back.

There were no console errors.
