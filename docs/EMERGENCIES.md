# Emergencies: first aid by age

24 new topics in `content/drafts/emergencies/`. Mo asked for CPR by age, choking, the most common emergencies such as seizures, and an app that covers everything. The drafts follow docs/CONTENT_SPEC.md: short sentences to read aloud; en, fa and ps for every line; and each page says when to go to hospital and what the hospital will do. With all 24 copied into a temporary content/src, `tools/validate.py` reports 0 errors and 0 warnings. The proposed first-aid change also validates.

**Merged on 2026-10-07.** The 24 topics are in `content/src/topics/`, with the first-aid changes, the Emergency button and screen (`config.emergency`), the symptom-finder links and the CPR animation on each CPR page. Section 4 below was the plan; docs/REVIEW.md ("Integration merge") lists what was chosen.

## 1. Judgement calls for Mo (medical check)

These are the places where the guidelines differ, or where the text simplifies them for families. The most important come first.

1. **Two thumbs, not two fingers, for babies under 1.** Mo's brief and the CPR animation narration (`anim-narration.json`, cpr-baby) say "two fingers". The 2025 guidelines changed this:
   - ERC 2025 and RCUK 2025: two-thumb encircling, for CPR and for choking chest thrusts.
   - AHA 2025: removed two-finger compressions. It uses two thumbs, or the heel of one hand.

   The text and pictures use two thumbs (`cpr-baby.thumbs`, `choking-baby.chest`, `em-cpr-baby-thumbs.svg`, and the inset in `em-choking-baby-chest.svg`). Settled at the merge: two thumbs everywhere; the animation narration (`anim.cpr-baby.s5`) now says two thumbs and the picture is being redrawn to match. (Earlier note: the animation said two fingers.) One of the two must change so the app gives one message. The other worker owns the animation files, so they were not edited. If Mo prefers two fingers, the review notes on choking-baby give replacement wording.
2. **30:2 for babies and children after 5 first breaths.**
   - RCUK 2025 lets lay rescuers use 30:2 or 15:2.
   - ERC 2025 uses 15:2 for trained rescuers.

   30:2 was chosen so that every age has one number, the same as the adult page and the animation.
3. **Newborn: breaths only, at family level.**
   - Helping Babies Breathe expects a bag and mask. Families have none, so the page teaches mouth over the baby's mouth and nose, one breath every 1 to 2 seconds.
   - No chest pushes. This matches the animation.
   - Head "tilted back a little" (the HBB slightly extended position).
   - No cord-clamping line.
4. **Adult CPR: hands-only first, breaths optional.** This follows ERC/AHA 2025 for lay rescuers. Drowning is the exception: 5 breaths first at every age (ERC), on the drowning page.
5. **Lone rescuer with a baby or child:** 1 minute of CPR, then go for help. There is no ambulance number, so every page says "send someone for a car".
6. **Fever fits always mean hospital now** (IMCI danger sign; meningitis cannot be ruled out at home). In the UK, a child with known simple febrile convulsions is often managed at home after review.
7. **Improvised tourniquet** (wide cloth and a stick) for life-threatening bleeding from a limb only, after pressure fails (ILCOR/ERC 2025). Note the time; do not loosen it.
8. **Choking: hospital after any thrusts.** Back blows alone in a baby also go to hospital, to keep the rule simple.
9. **Snakebite: no pressure bandage.** Vipers are common in northern Afghanistan (WHO SEARO 2016). Which hospital in Samangan holds snake or scorpion antivenom is unknown; please add the place.
10. **Scorpion stings in children are urgent.** Adults with local pain only are not told to stay home. The page simply does not list them as urgent.
11. **Low sugar: "4 teaspoons of sugar in water"** (about 16 g; ERC says 15 to 20 g). This is a number, so remove it if the no-doses rule should cover food too.
12. **Asthma: no puff numbers** (no doses in the book). UK teaching is 1 puff every 30 to 60 seconds, up to 10.
13. **Burns:**
    - Cool for 20 minutes. It still helps up to 3 hours later (UK and Australian burns teaching).
    - Size rule: "bigger than the person's palm". first-aid.urgent says "hand". Choose one.
14. **Heat stroke: cold-water immersion up to the neck** (ILCOR/ERC first choice), with the head held. Check this is safe to teach.
15. **Head injury: "wake them a few times in the night"** is common lay advice. NICE no longer requires it. CT may only be in Mazar-i-Sharif or Kabul.
16. **Falls:**
    - Manual head hold, no collar (ERC/IFRC).
    - Moving the person on a door or board is described without log-roll detail.
    - Bonesetters are named respectfully in the "do not" list.
17. **Severe allergy: adrenaline pen only "if they have their own".** These pens are rare in Afghanistan.
18. **Who may help.** The cpr-adult page has a tip: "anyone, man or woman, can help". The pictures follow the animation: a man helps the adult man, and a woman helps the child, baby and newborn. Check that the wording is culturally right.
19. **Heart attack and stroke are not repeated.** cpr-adult's hospital tip points to Danger signs in adults (red-flags).
20. **Eclampsia:** the seizures page says a fit in pregnancy or after birth means hospital now. It points to the pregnancy pages and does not repeat them.

## Pictures

Pictures follow docs/ART_SPEC.md: 360x200, the app palette, and blank faces, as Mo asked. Hand positions match the age:

| Age or situation | Hand position shown |
|---|---|
| Adult CPR | Heel of one hand, the other on top, arms straight, centre of the chest |
| Child CPR | Heel of one hand on the lower breastbone; the other hand on the forehead |
| Baby CPR | Two thumbs on the breastbone just below the nipple line, hands round the chest (seen from above) |
| Baby choking | Face down along the forearm, head low, blows between the shoulder blades; then face up, head low, two thumbs |
| Adult choking | Standing behind and to the side, leaning them forward; fist above the navel for belly pushes |

Files:
- 22 step pictures: `img/pics/em-*.svg`. They use the new step `"picture"` field, which the validator checks.
- 7 hero pictures: `img/topics/<id>.svg` for drowning, head-injury, poisoning, cold-hypothermia, low-sugar, allergy-severe and fever-fits.
- The other 17 topics fall back to the generic picture for now.
- Contact sheet: `img/_preview/emergencies.png`.

No existing file was overwritten.


## 2. The topics and their sources

### cpr-newborn: Newborn not breathing at birth

- Section: children. 6 steps. Step pictures: img/pics/em-cpr-newborn-breaths.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: In the first minute: dry, rub, keep warm, then give breaths.
- Sources:
  - WHO / American Academy of Pediatrics: Helping Babies Breathe, 2nd edition (2016): the Golden Minute (dry, keep warm, clear the airway if needed, stimulate, ventilate)
  - WHO recommendations on newborn health (2017) and WHO Guidelines on basic newborn resuscitation (2012)
  - European Resuscitation Council Guidelines 2025: Newborn Resuscitation and Support of Transition of Infants at Birth (5 inflation breaths, then ventilation about 30 a minute)
  - WHO Pregnancy, Childbirth, Postpartum and Newborn Care (PCPNC, 2015): care of the newborn at birth
- Notes for review:
  - Family level, not health worker level. HBB assumes a bag and mask. Families at a home birth have none, so this page teaches mouth-to-mouth-and-nose breaths. Check this is acceptable.
  - No chest pushes for newborns. HBB at family level is breaths only, and the cpr-newborn animation is breaths only. Newborn life support adds 3 pushes to 1 breath only after 30 seconds of good breaths with a slow heart, which families cannot measure. The page says keep giving breaths until the baby breathes or cries, including on the way to hospital. Decide whether a chest-push line should be added.
  - 'One breath every 1 to 2 seconds' = 30 to 60 a minute (HBB 40 a minute; ERC 2025 NLS about 30 a minute). It matches the animation narration.
  - Head 'tilted back a little' (HBB: head slightly extended, the 'sniffing' position), matching the animation.
  - No cord-clamping advice. HBB says clamp and cut the cord if ventilation is needed. Home births often wait for the midwife. Add a line if wanted.
  - Dont: slapping and holding upside down are harmful customs. Check whether a local custom (e.g. cold water, smoke, or calling into the ear) should be named.
  - Pashto 'کړېږي' for grunting and Dari 'ناله می‌کند': check with native speakers.

### cpr-baby: Baby not breathing (under 1)

- Section: children. 6 steps. Step pictures: img/pics/em-cpr-baby-breaths.svg, img/pics/em-cpr-baby-thumbs.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Under 1 year: 5 breaths first, then push with two thumbs.
- Sources:
  - European Resuscitation Council Guidelines 2025: Basic Life Support and Paediatric Life Support (lay rescuer sequences)
  - American Heart Association 2025 Guidelines for CPR and ECC: Adult and Pediatric Basic Life Support
  - ILCOR 2025 International Consensus on CPR and ECC Science with Treatment Recommendations
  - Resuscitation Council UK 2025: Paediatric out-of-hospital basic life support algorithm
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): resuscitation
  - WHO Pocket book of hospital care for children, 2nd edition (2013): chart 3, infant airway position
- Notes for review:
  - Two thumbs, not two fingers. ERC/RCUK 2025 replaced the two-finger method with the two-thumb encircling method for infants. AHA 2025 allows two thumbs or the heel of one hand. Two thumbs used here, and the picture shows it.
  - Ratio 30:2 after 5 first breaths. ERC 2025 uses 15:2 for trained rescuers. RCUK 2025 allows lay bystanders 30:2 or 15:2. 30:2 was chosen so every age uses one number, the same as the adult page and the animation. Change to 15:2 if you prefer.
  - Depth 'a third of the chest, about 4 cm' (ERC/AHA).
  - Lone rescuer: 1 minute of CPR, then carry the baby to get help (ERC/RCUK). There is no ambulance number, so 'send someone for a car'.
  - Response check by tapping the soles of the feet is common teaching. ERC says 'stimulate', with no set method.

### cpr-child: Child over 1 not breathing

- Section: children. 6 steps. Step pictures: img/pics/em-cpr-child-hand.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: From 1 year to puberty: 5 breaths first, then chest pushes.
- Sources:
  - European Resuscitation Council Guidelines 2025: Basic Life Support and Paediatric Life Support (lay rescuer sequences)
  - American Heart Association 2025 Guidelines for CPR and ECC: Adult and Pediatric Basic Life Support
  - ILCOR 2025 International Consensus on CPR and ECC Science with Treatment Recommendations
  - Resuscitation Council UK 2025: Paediatric out-of-hospital basic life support algorithm
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): resuscitation
- Notes for review:
  - Ages: 'child' = 1 year to puberty (ERC/AHA). From puberty, use the adult page.
  - Ratio 30:2 after 5 first breaths (RCUK 2025 allows lay rescuers 30:2 or 15:2; ERC 2025 trained rescuers use 15:2). See the note on cpr-baby.
  - Depth 'a third of the chest, about 5 cm' (ERC/AHA). One hand, or two hands for a big child.

### cpr-adult: Adult collapsed, not breathing

- Section: everyone. 6 steps. Step pictures: img/pics/em-cpr-adult-hands.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Push hard and fast on the chest until help arrives.
- Sources:
  - European Resuscitation Council Guidelines 2025: Basic Life Support and Paediatric Life Support (lay rescuer sequences)
  - American Heart Association 2025 Guidelines for CPR and ECC: Adult and Pediatric Basic Life Support
  - ILCOR 2025 International Consensus on CPR and ECC Science with Treatment Recommendations
  - Resuscitation Council UK 2025: Paediatric out-of-hospital basic life support algorithm
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): resuscitation
  - WHO fact sheet: Cardiovascular diseases (2025): heart attack and stroke warning signs
- Notes for review:
  - Matches the anim.cpr narration (hands-only first, ERC lay sequence). Breaths are optional: 'if you know how, 2 breaths after every 30 pushes' (ERC/AHA 2025).
  - No shock machine (AED) step: AEDs are not available in Samangan villages. Add one if clinics get them.
  - Tip 'anyone, a man or a woman, can help' is a cultural judgement call. The animation shows a man helping a man. Check the wording with local health workers.
  - Drowned adults get 5 breaths first: that is on the drowning page, not here.
  - Pregnant woman: no 'push the bump to the left' step, to keep it simple.
  - Hospital tip links to Danger signs in adults (red-flags) for heart attack and stroke, so these are not repeated here. It is 2 sentences and about 27 words.

### choking-baby: Choking baby (under 1)

- Section: children. 5 steps. Step pictures: img/pics/em-choking-baby-back.svg, img/pics/em-choking-baby-chest.svg. Hero picture: none yet (falls back to the generic picture). Links: topic/cpr-baby.
- Summary: Under 1 year: 5 back blows, then 5 chest pushes.
- Sources:
  - European Resuscitation Council Guidelines 2025: Basic Life Support and Paediatric Life Support, foreign-body airway obstruction
  - American Heart Association 2025 Guidelines: adult and pediatric foreign-body airway obstruction (back blows and abdominal thrusts for adults and children; back blows and chest thrusts for infants)
  - Resuscitation Council UK 2025: Paediatric choking algorithm
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): choking
- Notes for review:
  - IMPORTANT: the brief said chest thrusts 'with two fingers'. ERC/RCUK 2025 now use the two-thumb method for infant chest thrusts and CPR. AHA 2025 uses the heel of one hand. Two thumbs are used here to match the baby CPR page. To keep two fingers instead, change the step text to: 'Put two fingers on the middle of the breastbone, just below the nipple line, and push in sharply 5 times.'
  - No abdominal thrusts under 1 year (all guidelines).
  - 'Baby' means under 1 year. Older children go to the 'choking' page.
  - Hospital after any back blows or chest thrusts: RCUK/ERC advise a medical check after abdominal or chest thrusts. Back blows alone are included here because a baby's airway may be hurt and families find it hard to judge.
  - Pashto ژامه for jaw and Dari الاشه (as in red-flags): check.

### choking: Choking: child over 1, adult

- Section: everyone. 6 steps. Step pictures: img/pics/em-choking-adult-back.svg, img/pics/em-choking-adult-belly.svg. Hero picture: none yet (falls back to the generic picture). Links: topic/choking-baby.
- Summary: 5 back blows, then 5 belly pushes. Repeat until it clears.
- Sources:
  - European Resuscitation Council Guidelines 2025: Basic Life Support and Paediatric Life Support, foreign-body airway obstruction
  - American Heart Association 2025 Guidelines: adult and pediatric foreign-body airway obstruction (back blows and abdominal thrusts for adults and children; back blows and chest thrusts for infants)
  - Resuscitation Council UK 2025: Paediatric choking algorithm
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): choking
- Notes for review:
  - Replaces the short first-aid.choking step (see EMERGENCIES.md for the proposed change to first-aid).
  - AHA 2025 now matches ERC: 5 back blows then 5 abdominal thrusts, repeated, for adults and children over 1.
  - Pregnant or very large: chest thrusts on the lower breastbone (ERC/AHA). The text says 'pull straight back'.
  - Unconscious choking: start CPR (ERC: 30 compressions; children: 5 rescue breaths first).
  - Pashto نوم for navel: check (it was flagged on the newborn page too).

### unconscious: Unconscious but breathing

- Section: everyone. 6 steps. Step pictures: img/pics/em-recovery-position.svg, img/pics/em-recovery-baby.svg. Hero picture: none yet (falls back to the generic picture). Links: topic/cpr-adult.
- Summary: Lay them on their side so they can breathe. All ages.
- Sources:
  - European Resuscitation Council Guidelines 2025: First Aid and Basic Life Support (recovery position for unresponsive, normally breathing people)
  - ILCOR 2025 Consensus on Science: first aid, recovery position
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): unresponsive and breathing normally
  - WHO Emergency Triage Assessment and Treatment (ETAT, 2016): positioning the unconscious child
- Notes for review:
  - ERC 2025: recovery position for adults and children who are unresponsive but breathing normally; keep checking breathing. Infants are held on their side with the head lower (common UK teaching).
  - Suspected spine injury: the tip says keep head and body in line. ERC allows the recovery position if the airway is at risk.
  - Every unconscious person goes to hospital now. A simple faint that wakes within a minute is not in the urgent list.

### drowning: Drowning

- Section: everyone. 5 steps. Step pictures: none. Hero picture: img/topics/drowning.svg (new).
- Summary: Rescue safely, give 5 breaths first, then chest pushes.
- Sources:
  - European Resuscitation Council Guidelines 2025: Special circumstances, drowning (5 initial rescue breaths for all ages)
  - ILCOR 2025 Consensus on Science: drowning
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): drowning, every drowning victim needs medical care
  - WHO fact sheet: Drowning (2024) and WHO Preventing drowning: an implementation guide (2017)
- Notes for review:
  - 5 rescue breaths first for drowned adults as well as children (ERC). AHA also puts breaths first in drowning.
  - All drowning victims go to hospital now (IFRC); this matches child-safety.urgent.water.
  - 'Reach or throw, don't go' rescue message (IFRC/RLSS). Rescue entry is not taught.

### seizures: Fits (seizures)

- Section: everyone. 5 steps. Step pictures: img/pics/em-seizure-cushion.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Keep them safe, time the fit, then lay them on their side.
- Sources:
  - WHO mhGAP Intervention Guide 2.0 (2016): epilepsy module, first aid for a convulsion, when to refer, keep medicine going
  - WHO fact sheet: Epilepsy (2024)
  - European Resuscitation Council Guidelines 2025: First Aid (seizures)
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): seizures
  - WHO recommendations for prevention and treatment of pre-eclampsia and eclampsia (2011): fits in pregnancy
  - WHO IMCI Chart Booklet (2014): convulsions are a general danger sign in children
- Notes for review:
  - Any fit in a baby or child is 'hospital now' (IMCI danger sign). This matches danger-child.urgent.convulsion. Fever fits have their own page (fever-fits).
  - 5 minutes: the mhGAP/ERC threshold for status epilepticus and for referral.
  - A known epileptic with a short, typical fit who wakes fully does not need hospital. The text covers this because only the listed situations are urgent.
  - Dont 'make them smell things' covers the custom of holding a shoe or onion under the nose. Check which local practices are common and whether to name them.
  - The stigma tip ('can go to school, work and marry') follows mhGAP's psychoeducation messages. It makes no religious claim. The id is 'not-curse', but the text does not say 'curse'.
  - Dari مرگی and Pashto مرګي for epilepsy: check local terms (e.g. 'صرع' is formal).

### fever-fits: Fits with fever in young children

- Section: children. 5 steps. Step pictures: none. Hero picture: img/topics/fever-fits.svg (new). Links: topic/fever.
- Summary: Common from 6 months to 5 years. Frightening, but usually harmless.
- Sources:
  - WHO IMCI Chart Booklet (2014): convulsions are a general danger sign, refer urgently
  - WHO Pocket book of hospital care for children, 2nd edition (2013): febrile convulsions, meningitis
  - WHO mhGAP Intervention Guide 2.0 (2016): epilepsy module, febrile seizures
  - European Resuscitation Council Guidelines 2025: First Aid (seizures)
- Notes for review:
  - All fever fits are 'hospital now' here (IMCI general danger sign, and meningitis cannot be ruled out at home). UK practice sends a known simple febrile convulsion home after review. Decide whether a child with known fever fits who wakes fully could go to the clinic the same day.
  - No paracetamol advice: the spec allows no doses, and fever medicine does not prevent fever fits.
  - Tepid sponging and wet cloths are discouraged (WHO pocket book); the dont item covers this.
  - 'Children grow out of it by about 6 years' and 'does not harm the brain' are reassurance from WHO/mhGAP and NICE patient advice. No numbers on recurrence are given.
  - Title is 6 English words.

### bleeding: Severe bleeding

- Section: everyone. 6 steps. Step pictures: img/pics/em-bleeding-press.svg, img/pics/em-bleeding-tourniquet.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Press hard and keep pressing. Tie a band only on a limb.
- Sources:
  - European Resuscitation Council Guidelines 2025: First Aid: life-threatening bleeding (direct pressure; tourniquet for life-threatening limb bleeding)
  - ILCOR 2025 Consensus on Science: first aid, haemorrhage control and improvised tourniquets
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): severe bleeding
  - WHO Basic Emergency Care: approach to the acutely ill and injured (WHO/ICRC, 2018): haemorrhage control
- Notes for review:
  - Tourniquet only for life-threatening bleeding from an arm or leg that pressure does not stop (ERC/ILCOR 2025). Families have no commercial tourniquet, so the text describes an improvised one: a wide cloth tied a hand's width above the wound and tightened by twisting a stick (windlass). ILCOR says improvised tourniquets often fail and must be wide and tightened with a windlass. Check that this is safe to teach without hands-on training.
  - 'Do not loosen it yourself' and 'note the time' follow ERC/ICRC teaching.
  - No haemostatic dressings (not available in villages).
  - Raising the legs for shock is left out to keep it simple. ILCOR allows passive leg raising when there is no injury.
  - Pashto 'سیروم' and Dari 'سیروم' for IV fluids: check the everyday word.

### burns: Burns and scalds

- Section: everyone. 5 steps. Step pictures: img/pics/em-burns-cool.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Cool with running water for 20 minutes, cover loosely, keep warm.
- Sources:
  - European Resuscitation Council Guidelines 2025: First Aid: thermal burns (cool with running water)
  - ILCOR Consensus on Science (2021 and 2025): cooling of thermal burns
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): burns
  - WHO fact sheet: Burns (2023)
  - WHO/UNICEF World report on child injury prevention (2008): burns
- Notes for review:
  - Replaces the short first-aid.burn step and first-aid.dont (see EMERGENCIES.md).
  - Cooling for 20 minutes matches first-aid.burn. IFRC says at least 10 minutes; ERC/ILCOR give no fixed time. 'Up to 3 hours later' is from Australian/UK burns teaching (cooling helps up to 3 hours), not a WHO text.
  - Size rule: 'bigger than the person's palm' (about 1% of the body). first-aid.urgent.big-burn says 'hand' and child-safety says 'palm'. Pick one wording for the whole book.
  - 'Any burn on a baby' is urgent, as in first-aid.urgent.big-burn.
  - Cling film is used in UK first aid. 'Clean plastic' may not be available; 'clean, dry cloth' is the fallback.
  - Pashto 'اوبلنې دانې' for blisters and Dari 'آبله': check.

### falls-fractures: Falls and broken bones

- Section: everyone. 6 steps. Step pictures: img/pics/em-spine-hold.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Fell from a roof or tree? Protect the neck and back.
- Sources:
  - European Resuscitation Council Guidelines 2025: First Aid: suspected spinal injury (manual stabilisation; no routine collars), fractures (splinting), cold for closed injuries
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): spinal injury, fractures, sprains
  - WHO Basic Emergency Care (WHO/ICRC, 2018): trauma, spinal protection
  - WHO/UNICEF World report on child injury prevention (2008): falls
- Notes for review:
  - No neck collar (ERC/IFRC no longer advise lay rescuers to use collars). Manual hold of the head is taught instead.
  - Moving the person on a door or board: transport in villages is by car or pickup, so this is a practical 'log-roll onto a board' message without the log-roll detail. Check it is safe to teach without training.
  - Bonesetters (شکسته‌بند / ماتې تړونکی) are widely used in Afghanistan. Tight traditional binding can cause compartment syndrome and gangrene. The dont item is worded respectfully; check the tone with local staff.
  - Ice or cold for 20 minutes: ERC/IFRC suggest cold for closed injuries (no set time; 20 minutes is common teaching).
  - Pashto 'د ملا تیر' for spine and 'ماتې تړونکی' for bonesetter: check.

### head-injury: Head injury

- Section: everyone. 5 steps. Step pictures: none. Hero picture: img/topics/head-injury.svg (new).
- Summary: After a knock to the head: who needs hospital, what to watch.
- Sources:
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): head injury and concussion
  - European Resuscitation Council Guidelines 2025: First Aid: concussion and head injury
  - WHO Basic Emergency Care (WHO/ICRC, 2018): head injury, danger signs
  - WHO/UNICEF World report on child injury prevention (2008): falls
- Notes for review:
  - Replaces the short first-aid.head step; its 'watch for 24 hours' advice is kept.
  - 'Wake them a few times' is common lay advice, not WHO wording. NICE no longer requires routine waking. Check whether to keep it.
  - Red flags follow NICE CG176 and IFRC (loss of consciousness, vomiting more than once, drowsiness, fit, worsening headache, fluid from nose or ears, weakness or speech change).
  - Hospital tip says 'send to a bigger hospital for a scan': CT may only be in Mazar-i-Sharif or Kabul. Check.

### electric-shock: Electric shock

- Section: everyone. 5 steps. Step pictures: img/pics/em-electric-stick.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Switch off first. Never touch them while the power is on.
- Sources:
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): electrical injuries
  - European Resuscitation Council Guidelines 2025: First Aid
  - European Resuscitation Council Guidelines 2025: Special circumstances, electrocution and lightning
  - WHO/UNICEF World report on child injury prevention (2008)
- Notes for review:
  - 'At least 20 steps' for high-voltage lines stands in for the 18 metres in UK/IFRC teaching.
  - Hospital after any strong shock: ERC/IFRC advise review for high-voltage injury, burns, loss of consciousness or arrhythmia. A small tingle from a household plug with no symptoms does not need hospital. Alert title says 'a strong shock'.
  - Dari 'لچ' (bare), 'سویچ', 'ساکت' and Pashto 'ساکټ', 'سویچ', 'پلګ' are loan words. Check the everyday terms.

### snake-scorpion: Snake and scorpion bites

- Section: everyone. 5 steps. Step pictures: img/pics/em-snakebite-splint.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Keep still and go to hospital. No cutting, sucking or tight bands.
- Sources:
  - WHO Guidelines for the management of snakebites, 2nd edition (WHO SEARO, 2016): first aid (reassure, immobilise, remove rings, no tourniquet, no cutting or suction, transport fast)
  - WHO Snakebite envenoming: a strategy for prevention and control (2019) and WHO fact sheet: Snakebite envenoming (2023)
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): snakebite, scorpion sting
  - European Resuscitation Council Guidelines 2025: First Aid
  - WHO Regional Office for the Eastern Mediterranean: scorpion sting management (antivenom and supportive care in children)
- Notes for review:
  - No pressure-immobilisation bandage. WHO SEARO 2016 allows it only for neurotoxic elapid bites and not for vipers. Central Asian vipers (Echis, Macrovipera, Gloydius) and the Central Asian cobra both occur in northern Afghanistan. A simple 'no tight bands' message is safer.
  - Left lateral position if vomiting (WHO SEARO).
  - Scorpion: any sting in a child is urgent because severe envenoming (Mesobuthus, Androctonus and Hottentotta species in the region) is worst in young children. Adults with local pain only may not need hospital. That is not stated, so families do not have to decide.
  - Antivenom availability in Samangan is unknown. Confirm which hospital stocks snake and scorpion antivenom and add the place name.
  - Dont 'wait before going to hospital' replaces an earlier draft that named traditional healers, to avoid sounding disrespectful. Name them if that is clearer.
  - Pashto زبېښل (suck), Dari گژدم and Pashto لړم: check.

### poisoning: Poisoning

- Section: everyone. 6 steps. Step pictures: none. Hero picture: img/topics/poisoning.svg (new). Links: topic/stress.
- Summary: Kerosene, farm sprays, medicines, rat poison: what to do first.
- Sources:
  - WHO Guidelines for the management of common childhood illnesses / Pocket book of hospital care for children, 2nd edition (2013): poisoning (do not induce vomiting; kerosene and pneumonitis; organophosphates)
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): poisoning, chemical exposure
  - European Resuscitation Council Guidelines 2025: First Aid: poisoning (no routine induced vomiting; do not give milk or water as antidote)
  - WHO Clinical management of acute pesticide intoxication: prevention of suicidal behaviours (2008)
  - WHO mhGAP Intervention Guide 2.0 (2016): self-harm
  - WHO/UNICEF World report on child injury prevention (2008): poisoning
- Notes for review:
  - Rinsing the mouth is reasonable for corrosives and pesticides. ERC 2025 advises against giving water or milk as a 'dilution' antidote. The text says 'give nothing else unless a health worker says so'.
  - Organophosphate signs are simplified to 'sweat, drool or twitch'. Small pupils are left out because they are hard to judge.
  - Rat poison: Afghan rat poisons may be anticoagulants (bleeding days later), zinc or aluminium phosphide ('rice tablet', highly lethal), or others. Phosphide poisoning gives off a gas. Consider adding 'keep the room aired' if it is common locally.
  - Iron tablets are given as an example of a delayed-harm medicine (pregnancy iron is in many homes).
  - Self-harm by poisoning (pesticides) is a major cause of suicide in the region. The link block goes to the Stress page. Check the tone.

### heat-stroke: Heat stroke

- Section: everyone. 5 steps. Step pictures: img/pics/em-heat-cooling.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Hot, confused or collapsed in the heat: cool them fast.
- Sources:
  - European Resuscitation Council Guidelines 2025: First Aid: heat stroke (whole-body cold-water immersion where possible)
  - ILCOR 2025 Consensus on Science: cooling for exertional heat stroke
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): heat-related illness
  - WHO Heat and health fact sheet (2024) and WHO/WMO Heatwaves and health: guidance on warning-system development (2015)
- Notes for review:
  - Cold-water immersion up to the neck is the ILCOR/ERC first choice for heat stroke in adults. With an unconscious person or a child, someone must hold the head above water. Check this is safe to teach.
  - Heat exhaustion: 'not better in 1 hour, go to the clinic' is a judgement call (UK NHS uses 30 minutes for adults).
  - No temperature numbers, as families have no thermometer.

### cold-hypothermia: Too cold (hypothermia)

- Section: everyone. 5 steps. Step pictures: none. Hero picture: img/topics/cold-hypothermia.svg (new).
- Summary: Shivering, slow or confused in the cold: warm them gently.
- Sources:
  - European Resuscitation Council Guidelines 2025: First Aid: hypothermia and frostbite
  - European Resuscitation Council Guidelines 2025: Special circumstances, accidental hypothermia
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): hypothermia, frostbite
  - WHO Thermal protection of the newborn: a practical guide (1997) and WHO Kangaroo mother care (2003)
- Notes for review:
  - Frostbite rewarming in warm water for about 30 minutes follows ERC/ILCOR (only if there is no risk of it freezing again). The 37 to 39 C temperature is given as 'warm, not hot'.
  - 'Warm sweet drinks if fully awake' (IFRC). No alcohol is mentioned because it is not culturally relevant.
  - 'Seems dead may still be saved' is the ERC hypothermia message. Families are told to keep CPR going on the way to hospital.
  - Overlaps winter-home (CO) and newborn (keep warm), but the focus here is accidental cold.

### eye-chemical: Chemical in the eye

- Section: everyone. 5 steps. Step pictures: img/pics/em-eye-wash.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Wash the eye with lots of clean water for 20 minutes.
- Sources:
  - European Resuscitation Council Guidelines 2025: First Aid: chemical eye injury (irrigate with large volumes of clean water)
  - ILCOR Consensus on Science (2020 and 2025): chemical injuries to the eye
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): eye injuries, chemical burns
  - WHO Primary eye care training manual (WHO EMRO, 2018): chemical burns and foreign bodies
- Notes for review:
  - Irrigation time 20 minutes (ILCOR: large volumes of water, no fixed time; UK teaching 20 to 30 minutes for alkali).
  - Lime/whitewash (چونه) and cement are common alkali causes in Afghan building work. Brushing off dry powder first follows UK/IFRC teaching.
  - Kohl/surma (سرمه، رانجه) and milk are named as harmful customs. Check whether other local eye remedies should be named.
  - Dari 'وایتکس' and Pashto 'وایټکس' (brand name for bleach) and 'تیزاب بتری': check.

### allergy-severe: Severe allergic reaction

- Section: everyone. 5 steps. Step pictures: none. Hero picture: img/topics/allergy-severe.svg (new).
- Summary: Swelling and trouble breathing after a food, sting or medicine.
- Sources:
  - European Resuscitation Council Guidelines 2025: First Aid: anaphylaxis (adrenaline auto-injector in the outer thigh; lie flat with legs raised or sit if breathing is hard; avoid standing)
  - World Allergy Organization Anaphylaxis Guidance (2020)
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): severe allergic reaction
  - WHO Model List of Essential Medicines: adrenaline for anaphylaxis
- Notes for review:
  - Allergy pens (adrenaline auto-injectors) are rare in Afghanistan. The step mentions them only 'if they have their own'. No dose is given (the spec allows none).
  - Positioning follows ERC 2025: sit up if breathing is hard, lie flat with legs raised if faint, do not stand or walk.
  - Pashto 'مچۍ' (bee) and 'ډبره' (wasp) need checking; Dari uses 'زنبور' for both, with 'زنبور عسل' for honey bee.
  - No 'dont' block: the steps cover the main points.

### low-sugar: Low sugar in diabetes

- Section: everyone. 5 steps. Step pictures: none. Hero picture: img/topics/low-sugar.svg (new). Links: topic/diabetes.
- Summary: Shaky, sweaty or confused: give sugar fast if they can swallow.
- Sources:
  - European Resuscitation Council Guidelines 2025: First Aid: hypoglycaemia (15 to 20 g of glucose or sugar by mouth if able to swallow; repeat after 15 minutes; then a snack)
  - WHO Package of Essential Noncommunicable Disease Interventions (WHO PEN, 2020): diabetes, hypoglycaemia
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): low blood sugar
  - WHO HEARTS-D: diagnosis and management of type 2 diabetes (2020)
- Notes for review:
  - The amount (4 teaspoons of sugar, about 16 g) is a number. Sugar is food, not medicine, but the spec only allows listed doses. ERC/IFRC give 15 to 20 g. Remove the number if you want: 'a glass of water with sugar stirred in'.
  - Repeat after 15 minutes (ERC). 'Not better after sugar twice' means hospital.
  - Overlaps diabetes.low-sugar (a short step). This page is the emergency version; diabetes.low-sugar could link here.
  - Dari 'بوره' (sugar) vs 'شکر' (blood sugar): check this reads clearly when heard.

### asthma-attack: Asthma attack

- Section: everyone. 5 steps. Step pictures: img/pics/em-asthma-spacer.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Sit them up, use the blue inhaler, go if not better fast.
- Sources:
  - WHO Package of Essential Noncommunicable Disease Interventions (WHO PEN, 2020): asthma, acute attack and referral
  - WHO Pocket book of hospital care for children, 2nd edition (2013): wheeze and asthma, home-made spacer from a 500 ml plastic bottle
  - Global Initiative for Asthma (GINA) 2025: action plan for worsening asthma
  - European Resuscitation Council Guidelines 2025: First Aid: asthma (help with own reliever inhaler)
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): asthma
  - WHO IMCI Chart Booklet (2014): chest indrawing
- Notes for review:
  - No puff numbers: the spec allows no medicine doses. UK teaching for an attack is 1 puff every 30 to 60 seconds up to 10 puffs. The text says 'the puffs the clinic advised'. Decide whether to give the number.
  - 'Blue inhaler' assumes salbutamol inhalers are blue in Afghanistan. Check.
  - Home-made spacer from a plastic bottle is in the WHO pocket book.
  - Dari 'اسپری' and 'فاصله‌دهنده', Pashto 'پف' and 'فاصله ورکوونکی' for inhaler and spacer: check local words.
  - No 'dont' block.

### nosebleed: Nosebleed

- Section: everyone. 4 steps. Step pictures: img/pics/em-nosebleed-pinch.svg. Hero picture: none yet (falls back to the generic picture).
- Summary: Lean forward and pinch the soft nose for 10 minutes.
- Sources:
  - European Resuscitation Council Guidelines 2025: First Aid: nosebleed (lean forward, pinch the soft part for 10 to 15 minutes, seek help if over 20 minutes)
  - IFRC International First Aid, Resuscitation and Education Guidelines (2020): nosebleed
  - WHO fact sheet: Crimean-Congo haemorrhagic fever (2022)
- Notes for review:
  - ERC 2025: pinch for 10 to 15 minutes, seek medical help if bleeding goes on for more than 20 minutes. Here: 10 minutes, then 10 more, then hospital.
  - The Congo fever tip links to the animal-illness page (CCHF is endemic in Afghanistan, with peaks around Eid al-Adha). It overlaps animal-illness.urgent.bleeding on purpose.
  - 'This week' for recurrent nosebleeds, as in the red-flags soon alert.
  - Dari 'دوای رقیق‌کنندهٔ خون' and Pashto 'د وینې نرموونکي درمل' for blood thinners: check.


## 3. Links inside the pages

Link blocks (`"type": "link", "to": "topic/<id>"`) are used where a reader must jump:

| Page | Link | Goes to |
|---|---|---|
| choking | baby-page | choking-baby |
| choking-baby | cpr | cpr-baby |
| unconscious | cpr | cpr-adult. The text sends children and babies to their own pages. |
| poisoning | purpose | stress |
| low-sugar | diabetes | diabetes |
| fever-fits | fever | fever |

All targets exist once the drafts are merged.

## 4. Integration notes (for Mo, or whoever merges)

1. **Copy the topics.** Copy the 24 topic files from `content/drafts/emergencies/` into `content/src/topics/`, but not `ui-additions.json` or `first-aid-changes.json`. Then run `tools/validate.py` and `tools/build.py`. The build auto-adds topics to their section if `sections.json` does not list them.
2. **sections.json:**
   - children: cpr-newborn, cpr-baby, cpr-child, choking-baby, fever-fits. Add them after danger-child.
   - everyone: cpr-adult, choking, unconscious, drowning, seizures, bleeding, burns, falls-fractures, head-injury, electric-shock, snake-scorpion, poisoning, heat-stroke, cold-hypothermia, eye-chemical, allergy-severe, low-sugar, asthma-attack, nosebleed.
   - Also list choking, drowning, burns, poisoning and seizures under children, because families look there first.
3. **config.urgentTopics** (these go in the "urgent" audio pack that is always downloaded):
   - Add: cpr-newborn, cpr-baby, cpr-child, cpr-adult, choking-baby, choking, unconscious, drowning, bleeding, seizures, fever-fits, burns, poisoning, snake-scorpion, allergy-severe.
   - That is about 15 pages of narration. To keep the pack small, put only the CPR, choking and unconscious pages (7 topics) in urgent and leave the rest in their sections.
4. **Home "Emergency" quick button** (a new home module, e.g. `"emergency"` placed just after `"ask"` in config.home):
   - A big red button with the `warning` icon, labelled `emergency` with the `emergencySub` line. Tapping it plays `ui.emergency` and opens an age picker (`emergencyWho`) with four big choices.
   - Each age opens a short list. The "Not breathing" page comes first, in red. Then "Other emergencies":

     | Age | Pages in the list |
     |---|---|
     | Newborn, just born | cpr-newborn, then newborn (danger signs) |
     | Baby under 1 | cpr-baby; choking-baby, unconscious, fever-fits, drowning, burns, poisoning, danger-child |
     | Child, 1 year to puberty | cpr-child; choking, unconscious, seizures, fever-fits (to 5 years), drowning, bleeding, burns, falls-fractures, head-injury, poisoning, snake-scorpion, electric-shock, heat-stroke, cold-hypothermia, eye-chemical, allergy-severe, asthma-attack, nosebleed, danger-child |
     | Adult or teenager | cpr-adult; choking, unconscious, seizures, bleeding, burns, falls-fractures, head-injury, poisoning, snake-scorpion, electric-shock, drowning, heat-stroke, cold-hypothermia, eye-chemical, allergy-severe, low-sugar, asthma-attack, nosebleed, red-flags (heart attack, stroke), pregnancy-danger |

   - The proposed strings, with fa, ps and en, and the two narrated `say` lines, are in `content/drafts/emergencies/ui-additions.json`. js/app.js, config.json and ui.json were not edited. The button needs a small `quick()`/screen addition in app.js.
5. **symptoms.json** (the "What is wrong?" finder) could add these topics to existing symptom ids:

   | Symptom id | Add |
   |---|---|
   | fits | seizures, fever-fits |
   | burn | burns |
   | poison | poisoning |
   | choking | choking, choking-baby |
   | bite | snake-scorpion |
   | bleeding | bleeding, nosebleed |
   | breathing | asthma-attack, allergy-severe, cpr pages |
   | sugar | low-sugar |
   | disaster | falls-fractures, head-injury, drowning |
   | safety | drowning, electric-shock, poisoning |

   A new "not breathing / unconscious" symptom could open unconscious and the CPR pages.
6. **first-aid page:** `content/drafts/emergencies/first-aid-changes.json` proposes:
   - replacing the short `first-aid.choking` step with a link to the choking page;
   - adding a link "Unconscious or not breathing?" after the lead.

   Both were checked against the validator on a temporary copy. Other optional clean-ups are listed in that file.
7. **CPR animation.** The other worker's `anim` block type is not in the validator yet, so no anim blocks were added. When it lands, place an anim block:
   - `cpr-newborn` after cpr-newborn.breaths;
   - `cpr-baby` after cpr-baby.thumbs;
   - `cpr-child` after cpr-child.hand;
   - `cpr-adult` after cpr-adult.push.

   Or use the `cpr` age-picker group on the Emergency screen. **First settle two fingers versus two thumbs** (judgement call 1).
8. **Narration.** About 1.9 to 2.6 minutes of Dari per topic. Run the build to regenerate narration scripts after the merge.
9. **Native-speaker review.** Every new block, in Dari and Pashto, is listed in docs/REVIEW.md under "Emergency topics (first aid by age)".
10. **App issue seen while testing (not changed).** In English (LTR), link blocks show a left-pointing chevron. It should probably point right in LTR.
