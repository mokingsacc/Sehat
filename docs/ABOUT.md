# Sehat (صحت): a family health book that speaks

*About the app, for funders, NGOs, doctors and community leaders. Written 7 October 2026.*

## In short

Sehat is a free family health book on the phone for villages in Samangan province, northern Afghanistan. It is in Dari and Pashto, and every block of text has a speaker button beside it, so people who cannot read can listen. It covers children (vaccines, danger signs, common illnesses) and adults (pregnancy and women's health, danger signs, common conditions). Once opened, it works without internet. It is made by Mo, a UK doctor whose family is from Samangan.

It does not replace a health worker. Its job is to help families care well at home and to know when to go to the clinic today, or to hospital now.

## Who it is for

Mothers, fathers and grandparents in rural Samangan, many with little or no reading, using cheap Android phones. Community health workers and midwives can also use it with families.

## The problem

- **Reading.** Many of the people it is for read little or not at all, so leaflets and text apps miss them. (No literacy figure for Samangan is in our research notes yet.)
- **Two languages.** Families speak Dari or Pashto. The Dari must be Afghan Dari, not Iranian Persian: an earlier Afghan tablet video library was criticised because its dubbed videos felt culturally wrong. The large speech companies offer Pashto computer voices but no Afghan Dari voice.
- **Weak, costly internet that can be cut.** Mobile data costs money and signal is patchy. On 29 September 2025 the internet was shut down nationwide for about 48 hours (activity fell below 1% of normal).
- **Distance to care.** The referral path runs from village health post to clinic, to the provincial hospital in Aybak, then to Mazar-i-Sharif Regional Hospital, 120 km from Aybak. In March 2025 WHO reported that more than a third of health facilities in the north and north-east had closed; nationally at least 420 closed after the US aid suspension (WHO, May 2025).
- **High need.** In 2025 Samangan had the highest rate of child pneumonia and chest infection of any province (717.3 per 10,000; WHO). The national survey (MICS 2022-23) reports stunting of 51.3% in Samangan against 44.7% nationally, and only 18.1% of Samangan women having 4 or more antenatal visits against 33.4% nationally (these survey figures are still to be checked against the original report). Maternal mortality is 521 per 100,000 live births. A Crimean-Congo fever outbreak was reported in Samangan in August 2026.
- **Donor-funded tools stopped.** A search of 23 health apps, phone lines and programmes found no free, offline, narrated Dari and Pashto health app for families. The ones that existed were for health workers, or were pilots that ended when funding did: the MAMA voice messages for pregnant women (2018, 895 women, 96% still enrolled after 6 months, never scaled up), the Health Video Library (2017-18), Teeko+ (ended 2021) and the Sehatmandi monitoring app (funding stopped August 2021). The paper Mother and Child Health Handbook exists, but no digital version was found.

## What the app does

**Built and working in testing:**

- **Two sections, 25 topics.** Children: vaccines, danger signs, newborn care, breastfeeding and food, diarrhoea and ORS, cough and pneumonia, fever, measles, growth, keeping children safe, first aid. Women: danger signs in pregnancy, care in pregnancy, after the birth, anaemia. Everyone: danger signs in adults, TB, blood pressure, diabetes, stress, clean hands and water, safe warm home in winter, illness from animals, salak sores (leishmaniasis), floods and earthquakes, first aid. Several topics were added because local research showed the burden (measles, winter smoke and fumes, animal illness, leishmaniasis, floods and earthquakes, child injuries).
- **The same simple shape on every page:** a picture, one or two opening sentences, numbered steps, a red box "go to hospital now, day or night", an amber box "go to the clinic today", a "do not" box for harmful customs, and tips.
- **Narration everywhere:** a speaker beside every block and every danger sign, and "listen to this page". People choose Dari or Pashto and a woman's or a man's voice, and can change it later.
- **Vaccines and child record:** the Afghan schedule from birth to 18 months, tetanus vaccine for women, and a private record for each child. Parents tick each vaccine; the app shows the next one due, with dates in the Afghan solar calendar.
- **Symptom finder:** "What problem do you have?" People type, or tap pictures; 32 common complaints in Dari, Pashto and English words lead to the right pages. Works offline. Speaking instead of typing needs internet.
- **Feedback by voice or text:** a voice note (up to 2 minutes) or a written note, kept on the phone and sent when there is signal.
- **Nearest clinics:** using the phone's location, a list of hospitals and clinics by distance and direction, a simple map that works offline, and a link for directions.
- **Works offline, small to download:** the app itself (code, pictures, words) is about 5 MB (less over the wire, compressed), and the Android file about 1.6 MB with no voices in it. Only the chosen language and voice then download, in packs: urgent first (about 26 MB per voice: the Emergency screen, CPR and its films first, about 3 MB, then the other emergency pages, every red box, page titles and the interface), then children, women and everyone (about 38 MB more). On mobile data, 2G or data saver only the urgent pack downloads by itself; the rest has a Download button in Settings, and any clip plays from the internet the first time it is tapped and is kept. Clips are MP3, 16 kHz mono, 24 kbit/s (about 65 MB per voice, 4 voices on the website).
- **Android app shared by Bluetooth:** a small Android app (Android 5.0 and newer) holds the whole book and can be passed from phone to phone with no internet (Bluetooth, Quick Share, ShareIt). Its Share button can send the app itself.
- **Web version** for iPhone and any other phone: open the link once and add it to the home screen.
- **Recording studio in the app:** a Dari or Pashto speaker reads each line on a phone and sends the recordings as one file on WhatsApp.
- **Dashboard and editor for Mo:** anonymous usage counts, the feedback (with voice notes), the searches that found nothing, a "Summarise feedback" button that uses AI (Claude) to group feedback into themes and suggest changes, and an editor to change words, recordings, the clinic list and the home screen from a phone. Publish checks for missing translations; phones take the new book the next time they are online.

**Still to do (honest status):**

- **Voices:** no narration has been recorded or generated yet. Computer voices are planned as placeholders, to be replaced by Afghan human voices. Until then the web version uses the phone's own speech where the phone has it; the Android app plays recorded clips only.
- **Medical review:** first drafts were written with AI help from the sources below. Mo's line-by-line clinical review is in progress, with open questions listed per topic in `docs/REVIEW.md`.
- **Language review:** Dari and Pashto wording, and local names for illnesses, need checking by native speakers.
- **Clinic list:** 40 places from OpenStreetMap, mostly private clinics in central Aybak. The Aybak provincial hospital and the public clinics are missing, and there are no phone numbers yet. The app says the list is incomplete.
- **Not yet field-tested** with families, and not yet live at a public address (the server and web addresses are not yet set in the app).
- **WHO permission** to be requested before wide release (see Licences).
- **Uzbek**, spoken by many in Samangan, is not included yet.

## Regional illnesses and treatments (research in progress)

> **Placeholder.** This section will be filled from the report `research/regional-burden-and-treatment.md` when it is ready: the main illnesses in Samangan and northern Afghanistan, and the treatments families are likely to meet.

## Safety and governance

- **Action first, two levels of urgency.** Each page tells people what to do and when to go, using the same fixed words: red "go to hospital now, day or night" and amber "go to the clinic today". The home screen says: "This book does not replace a doctor. In danger, go to the nearest clinic or hospital."
- **No doses for self-treatment.** The only amounts given are those WHO itself gives families: ORS, zinc for diarrhoea (10 mg a day under 6 months, 20 mg from 6 months, for 10 to 14 days), and iron and folic acid in pregnancy "as given by the clinic". Everything else says "medicine from the clinic" or "ask the health worker".
- **Clinical review.** Every topic lists its sources and its open review points. Mo, a UK doctor, reviews them; the plan is to add two Afghan doctors, one Dari and one Pashto speaker. Changes made after review are recorded.
- **Culture.** Afghan Dari and Pashto words, respectful and never blaming, neutral on religion, families deciding together, and planning ahead for transport and money. People in the pictures have no faces.
- **Privacy (what the code does):**
  - No account and no sign-in. The child record (names, birth dates, vaccines) stays on the phone and is never sent.
  - Location is used on the phone only, to sort clinics by distance. It is not sent.
  - Usage counts are anonymous and can be switched off in Settings (this also deletes unsent counts). They are added up on the phone and sent as one total per day: language, phone type (iPhone, Android or other), app version, district if chosen, pages opened and minutes on them, clips played, and events (shared, a vaccine visit ticked with no child details, nearest-clinic used but not where). There is no install number. For the symptom finder only the matched symptom is counted; when nothing matched, nothing typed is sent.
  - Feedback is sent only when a person presses Send: the text (up to 2,000 characters) or voice note (up to about 1 MB, audio only), with language, app version and page. It carries no install number, so it cannot be linked to the phone's other messages. The server stamps its own time and deletes voice notes after 90 days.
  - The server does not store IP addresses. The dashboard and editor need a secret key.
  - When Mo presses "Summarise feedback", written feedback from the last 60 days is sent to Anthropic's AI service. Typed searches are never sent, and voice notes are not sent.
  - Speaking into the symptom finder uses the phone browser's own speech recognition, which needs internet; that audio does not go to Sehat's server. The app says so before the first use.

## What it costs to run

- **App hosting:** GitHub Pages, free.
- **Server, dashboard and editor:** Cloudflare Workers free plan (100,000 requests a day) with its free database (500 MB, 100,000 rows written and 5 million rows read a day). Enough for village scale. The server keeps daily budgets under these limits (usage rows, disease reports, feedback and voice-note bytes) and answers "try later" when one is used up, so one busy or misused phone cannot fill the database; the budgets can be raised in `server/wrangler.toml` [vars].
- **AI feedback summary:** an Anthropic API key; estimated at pennies a week at village scale.
- **Android app:** built automatically on each update; no app-store fees, since it is shared as a file.
- There is no paid staff. The real costs are people's time: recording, review and field work.

## What support would help

1. **A field pilot:** 20 to 50 families in one village for a month, watching usage and feedback, fixing, then growing.
2. **Afghan clinical reviewers:** two Afghan doctors, one Dari and one Pashto speaker.
3. **Native speakers and recordings:** Dari and Pashto readers, a woman and a man for each, to check wording and record about 507 short lines each.
4. **Health workers and midwives** who will use it with families, so it spreads with trust.
5. **Clinic data:** the Ministry of Public Health facility list with GPS points for Samangan (from the provincial health directorate or the clinic implementer MMRCA), and tested clinic and ambulance phone numbers.
6. **Partnerships and endorsement:** WHO Afghanistan, UNICEF, the Afghan Red Crescent, the Ministry of Public Health; the paper Mother and Child Health Handbook files (UNICEF, JICA) so the child record matches the card families know; Aga Khan Health Services for field testing with health workers; the Afghanistan Midwifery Association and Maternity Foundation for review; Jhpiego for the earlier MAMA Dari and Pashto voice scripts; Hesperian and CHA for Dari health materials.
7. **Spreading it:** QR posters at mosques, schools, pharmacies and clinics, WhatsApp links, and Afghans abroad sending it to family.
8. **Funding:** humanitarian innovation grants once a pilot shows numbers.
9. **Next features:** Uzbek narration, vaccine reminders, a medicines page (ORS and zinc, paracetamol, iron), an offline map, one-tap emergency numbers, a growth chart, a question-by-question symptom helper, and children's stories. Province packs would let other provinces have their own clinic lists and voices.

## Licences of reused material

- **Text** is adapted from WHO and WHO/UNICEF guidance for free, non-commercial health education. Some sources are "All rights reserved" (IMCI Chart Booklet 2014, PCPNC 2015, WHO Counselling handbook 2013, WHO postnatal care recommendations 2013, WHO/UNICEF community health worker package 2011, WHO PEN 2013), so permission will be asked from WHO before wide release. Others are CC BY-NC-SA 3.0 IGO (WHO PEN 2020, WHO Guide to cancer early diagnosis 2017, Caring for the newborn at home 2015), which allow non-commercial adaptation with WHO's adaptation notice and no WHO logo. Facts for Life 2010 may be reproduced for non-profit use with acknowledgement.
- **Icons:** 55 of the 91 icons are adapted from [Health Icons](https://healthicons.org) (Resolve to Save Lives), MIT licence; the rest, and all scene pictures, were drawn for this app.
- **Font:** Noto Naskh Arabic, SIL Open Font License 1.1 (Copyright 2022 The Noto Project Authors).
- **Clinic locations:** © OpenStreetMap contributors, ODbL 1.0, credited in the app.
- **Calendar conversion:** after jalaali-js (MIT).

## Sources

**WHO guidance on children and newborns**
- WHO IMCI Chart Booklet (2014) ([PDF](https://cdn.who.int/media/docs/default-source/mca-documents/child/imci-integrated-management-of-childhood-illness/imci-in-service-training/imci-chart-booklet.pdf))
- WHO Pocket Book of Hospital Care for Children (2013), Chart 15, Plan A, fever and meningitis ([Chart 15](https://www.ncbi.nlm.nih.gov/books/NBK154434/bin/ch5-fs3.pdf))
- WHO/UNICEF Caring for newborns and children in the community (2011), CHW chart booklet ([WHO](https://www.who.int/publications/i/item/9789241548045))
- WHO/UNICEF Caring for the newborn at home (2015) ([WHO](https://www.who.int/publications/i/item/9789241549295))
- WHO recommendations on postnatal care of the mother and newborn (2013) ([NCBI](https://www.ncbi.nlm.nih.gov/books/NBK190090/)); WHO recommendations on maternal and newborn care for a positive postnatal experience (2022)
- WHO Kangaroo mother care (2003); WHO recommendations for care of the preterm or low-birth-weight infant (2022)
- WHO guideline for complementary feeding of infants and young children 6 to 23 months (2023); WHO guideline on vitamin A supplementation 6 to 59 months (2011)
- WHO Motor Development Study (2006); WHO/UNICEF Care for Child Development (2012)
- WHO/UNICEF joint statement on clinical management of acute diarrhoea (2004)
- WHO/UNICEF World report on child injury prevention (2008)

**WHO guidance on pregnancy and birth**
- WHO Pregnancy, Childbirth, Postpartum and Newborn Care (PCPNC), 3rd ed. (2015), sheets M2, M4, M6, J10 ([NCBI](https://www.ncbi.nlm.nih.gov/books/NBK326681/))
- WHO recommendations on antenatal care for a positive pregnancy experience (2016)
- WHO Counselling for maternal and newborn health care (2013), Sessions 7 and 8 ([NCBI](https://www.ncbi.nlm.nih.gov/books/NBK304178/))
- WHO technical consultation on birth spacing (2005); WHO Thinking Healthy (2015)

**WHO guidance for adults**
- WHO PEN implementation tools (2013) ([PDF](https://www.afro.who.int/sites/default/files/2017-06/9789241506557_eng.pdf)); WHO HEARTS (2018); WHO HEARTS-D (2020); WHO guideline for the pharmacological treatment of hypertension (2021); WHO guideline on sugars intake (2015)
- WHO consolidated guidelines on tuberculosis: Module 1 prevention (2024), Module 2 screening (2021), Module 4 treatment (2022); WHO TB infection prevention and control (2019)
- WHO preventive chemotherapy for soil-transmitted helminths (2017)
- WHO Control of the leishmaniases, TRS 949 (2010); WHO EMRO manual for case management of cutaneous leishmaniasis (2014)
- WHO/WOAH/FAO Anthrax in humans and animals, 4th ed. (2008)
- WHO Guide to cancer early diagnosis (2017) ([PDF](https://www.afro.who.int/sites/default/files/2017-05/9789241511940-eng.pdf)); WHO Africa: warning signs of cancer (2017) ([page](https://afro.who.int/news/7-warning-signs-cancer))
- WHO mhGAP Intervention Guide 2.0 (2016); WHO Doing What Matters in Times of Stress (2020) ([WHO](https://www.who.int/publications/i/item/9789240003927))

**WHO guidance on water, food, air and disasters**
- WHO Guidelines for drinking-water quality, 4th ed. (2022); WHO Guidelines on sanitation and health (2018); WHO Five Keys to Safer Food (2006)
- WHO indoor air quality guidelines: household fuel combustion (2014) and selected pollutants (2010)
- WHO technical note: flooding and communicable diseases
- WHO Afghanistan: CCHF vigilance during Eid al-Adha ([page](https://www.emro.who.int/afg/afghanistan-news/cchf-eid.html))

**WHO fact sheets:** anaemia, brucellosis ([link](https://www.who.int/news-room/fact-sheets/detail/brucellosis)), burns ([link](https://www.who.int/news-room/fact-sheets/detail/burns)), cardiovascular diseases ([link](https://www.who.int/news-room/fact-sheets/detail/cardiovascular-diseases-(cvds))), Crimean-Congo haemorrhagic fever ([link](https://www.who.int/news-room/fact-sheets/detail/crimean-congo-haemorrhagic-fever)), diabetes ([link](https://www.who.int/news-room/fact-sheets/detail/diabetes)), drowning, household air pollution, hypertension ([link](https://www.who.int/news-room/fact-sheets/detail/hypertension)), infant and young child feeding ([link](https://www.who.int/news-room/fact-sheets/detail/infant-and-young-child-feeding)), leishmaniasis ([link](https://www.who.int/news-room/fact-sheets/detail/leishmaniasis)), measles, meningitis, pneumonia in children, rabies, suicide, tuberculosis ([link](https://www.who.int/news-room/fact-sheets/detail/tuberculosis)).

**Family-facing and first aid**
- WHO/UNICEF and partners, Facts for Life, 4th ed. (2010) ([PDF](https://www.unicef.cn/en/media/7796/file/Facts%20for%20Life.pdf))
- IFRC International First Aid, Resuscitation and Education Guidelines (2020) ([PDF](https://www.ifrc.org/sites/default/files/2022-02/EN_GFARC_GUIDELINES_2020.pdf)); IFRC key messages for disaster risk reduction (2018)
- ILCOR Consensus on Science (2021), cooling of burns ([page](https://costr.ilcor.org/document/duration-of-cooling-with-water-for-thermal-burns-as-a-first-aid-intervention-fa-770-systematic-review))
- ICRC Afghanistan mine and explosive remnants risk awareness

**Vaccine schedule**
- UNICEF Afghanistan (2023) schedule, as reported in Saeedzai et al., Global Health Action 2025 ([PMC12616657](https://pmc.ncbi.nlm.nih.gov/articles/PMC12616657/))
- WHO EMRO Afghanistan EPI review (2017) ([PDF](https://joomla.emro.who.int/images/stories/afghanistan/afg_epi_review_report_final.pdf))
- WHO/UNICEF immunisation coverage estimates (WUENIC), Afghanistan, July 2026 ([PDF](https://data.unicef.org/wp-content/uploads/cp-local/wuenic-2026/wuenic_afg.pdf))
- CDC MMWR, 12 December 2024, polio in Afghanistan ([page](https://www.cdc.gov/mmwr/volumes/73/wr/mm7349a4.htm)); WHO EMR Measles and Rubella Bulletin (2024); WHO vaccine position papers

**Burden of illness and local data**
- WHO Afghanistan Infectious Disease Outbreaks Situation Report, week 48 2025 ([PDF](https://www.emro.who.int/images/stories/afghanistan/Afghanistan-Outbreaks-Situation-report-week-48-2025.pdf)); WHO Emergency Situation Report 61, February 2026 ([PDF](https://www.emro.who.int/images/stories/afghanistan/emergency-situation-report-61-february-2026.pdf))
- Ministry of Public Health National Disease Surveillance weekly reports 2026, weeks 8 and 33 ([week 33](https://moph.gov.af/sites/default/files/2026-09/NDSR%20WER%2033-%202026_0.pdf))
- Afghanistan MICS 2022-23 ([PDF](https://mics.ipums.org/mics/resources/enum_materials_pdf/report_af2022a_eng.pdf)); IPC Afghanistan acute food insecurity and malnutrition snapshot, June 2025 to September 2026 ([PDF](https://www.foodsecurityportal.org/sites/default/files/2025-12/IPC_Afghanistan_Acute_Food_Insecurity_Malnutrition_Jun2025_Sep2026_Snapshot%20%281%29.pdf))
- Global Burden of Disease 2016 for Afghanistan, Arch Iran Med 2018 ([page](https://www.journalaim.com/Article/aim-1928)); GBD 2019 air pollution in Afghanistan, IJERPH 2024 ([page](https://www.mdpi.com/1660-4601/21/2/197)); STEPS 2018 hypertension analysis, Frontiers in Public Health 2026; WHO EMRO noncommunicable diseases page
- Rahimi et al., cutaneous leishmaniasis in Afghanistan, medRxiv preprint 2026 ([page](https://www.medrxiv.org/content/10.64898/2026.08.10.26360070v1.full)); Akbarian et al., brucellosis and Q fever, PLoS NTD 2015 ([page](https://pmc.ncbi.nlm.nih.gov/articles/PMC4618140))
- Causes of newborn deaths at Mazar-i-Sharif Regional Hospital, Düsseldorf University dissertation; Ministry of Public Health carbon monoxide figures (via KabulNow, January 2025); reports of the November 2025 earthquake and 2026 floods in Samangan
- Existing apps and services: JMIR mHealth 2020 on MAMA Afghanistan ([PMC7399960](https://pmc.ncbi.nlm.nih.gov/articles/PMC7399960/)); Conflict and Health 2020 on the Health Video Library; UNICEF Afghanistan 2019 on the MCH Handbook ([page](https://www.unicef.org/afghanistan/stories/providing-health-passport)); Amnesty International and CPJ on the 2025 internet shutdown

**Clinic locations**
- OpenStreetMap, HOT Health Facilities of Afghanistan export, 5 October 2026, ODbL 1.0 ([HDX](https://data.humdata.org/dataset/hotosm_afg_health_facilities))
- Ministry of Public Health Sehatmandi Samangan provincial review (September 2019); UNDP Afghanistan (January 2026) on Samangan district hospitals; World Bank (December 2019) on Hazrat-e-Sultan clinic
