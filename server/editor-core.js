// The book editor's rules, shared by the server (server/worker.js) and the editor page in the browser.
// Everything sits inside editorCore(), which uses nothing from outside itself, so the editor page gets this same code as
// text (editorCore.toString()): the check the editor shows is the check the server makes.
// The editor keeps only the parts of the book it changed ("units", js/overlay.js). The page lays them over the app's
// newest book; the server stores them one row each and never has to read the whole book (docs/EDITOR_AND_RELEASES.md).
export function editorCore() {
  const LANGS = ['fa', 'ps', 'en'];
  // Narration "slots": one per language and voice (f = a woman's voice, m = a man's voice), e.g. fa-m.
  // Old uploads and old books used the bare language ("fa"); that is read as the woman's voice ("fa-f").
  const SLOTS = LANGS.flatMap((lg) => [lg + '-f', lg + '-m']);
  const PACKS = ['urgent', 'children', 'women', 'everyone'];
  const URGENT_TOPICS = ['danger-child', 'pregnancy-danger', 'red-flags', 'first-aid'];
  const SECTIONS = ['children', 'women', 'everyone'];
  // topic lists in book.sections: the three sections, "emergency" (the Emergency screen), and the lists with their own page
  // (config.lists in content/src/config.json): kit (home health kit), safety (home safety), hospital, food (food and garden), wellbeing
  const PAGE_LISTS = ['kit', 'safety', 'hospital', 'food', 'wellbeing'];
  const LISTS = [...SECTIONS, 'emergency', ...PAGE_LISTS];
  // same as tools/validate.py: where a "link" block can go
  const TOOLS = ['breaths', 'reading', 'reading/temp', 'reading/bp', 'reading/sugar', 'reading/spo2', 'reading/muac'];
  const LINK_RE = /^(tool\/([a-z0-9/-]+)|topic\/([a-z0-9-]+)|kit|family|near|growth|growth\/measure|share|ask|emergency)$/;
  const ID_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;
  const TOPIC_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  // same list as tools/validate.py
  const ICONS = `clinic hospital car phone calendar clock moon family talk card check no warning money house
baby newborn-warm cord breastfeed bowl-food cup-spoon ors zinc water handwash thermometer fever cough breathing-fast chest-indrawing no-drink vomit convulsion sleepy stool-blood eye-sunken skin-pinch growth muac swollen-feet milestones jaundice syringe drops pill rash toys-play
pregnant bleeding headache eye-blurred belly-pain swelling baby-movement waters iron-pill birth-plan midwife rest food-iron sad
heart stroke-face bp sugar foot lungs mask window weight-loss lump urine-blood stiff-neck wound burn cool-water dog poison choking stove smoke salt walk sleep breathe people eye tooth animals milk insect`.split(/\s+/);
  const ICON_SET = new Set(ICONS);
  const BLOCK_TYPES = { lead: 'opening sentence (lead)', step: 'step', alert: 'danger signs box', dont: '"do not" box', tip: 'tip', link: 'link to a tool or another page', anim: 'animation (picture story)', clinic: 'what the clinic or hospital does' };
  const HOME_MODULES = { emergency: 'Emergency button (big, red: age picker, then first aid)', firstAid: 'CPR and first aid', children: 'Children (big picture button)', adults: 'Adults (big picture button)', share: 'Share Sehat', wellbeing: 'Well-being', install: 'Add to home screen banner', ask: 'Ask: symptom search', nextVaccine: 'Next vaccine due (when a child is added)', sections: 'Children and adults big pictures', quick: 'Quick buttons (vaccines, danger signs, my family, first aid)', near: 'Nearest clinic', feedback: 'Send feedback', disclaimer: 'Safety note', tools: 'Breathing counter and "what does the number mean?"', kit: 'Home health kit', safety: 'Home safety', hospital: 'Going to the clinic or hospital', food: 'Food and garden', sendApp: 'Send the app to another phone (Android app only)' };
  const STATUSES = ['open', 'unknown', 'closed'];
  const LN = { fa: 'Dari', ps: 'Pashto', en: 'English' };

  const sayL = (L) => Object.fromEntries(LANGS.map((lg) => [lg, String((L && L[lg]) || '').trim()]));
  const hasText = (L) => !!L && typeof L === 'object' && LANGS.some((lg) => String(L[lg] || '').trim());
  const cleanL = (L) => Object.fromEntries(LANGS.map((lg) => [lg, typeof (L && L[lg]) === 'string' ? L[lg] : '']));

  // Explainer animations (book.anims, written by tools/build.py): the narration ids an animation or a group needs,
  // and those an "anim" block brings to its page (same as tools/anims.py needed_ids and block_ids).
  function animNeeded(b, name) {
    const A = b.anims || {}, g = (A.groups || {})[name];
    if (g) return [`anim.${name}.title`, `anim.${name}.ask`, ...g.map((v) => `anim.${v}.label`), ...g.flatMap((v) => animNeeded(b, v))];
    return (A.ids || {})[name] || [`anim.${name}.title`];
  }
  function animBlockIds(b, bl) {
    const g = ((b.anims || {}).groups || {})[bl.anim];
    if (bl.pick && g) return [`anim.${bl.anim}.title`, `anim.${bl.anim}.ask`, ...g.map((v) => `anim.${v}.label`), ...animNeeded(b, bl.pick)];
    return animNeeded(b, bl.anim);
  }
  // Same as tools/build.py: the spoken lines of one topic (its title and the text of every block).
  function topicNarration(tid, t) {
    const n = {};
    if (tid === 'vaccines' || !t || !Array.isArray(t.blocks)) return n;
    n[tid + '.title'] = sayL(t.title);
    for (const bl of t.blocks) {
      if (!bl || !bl.id) continue;
      if (bl.type === 'step' || bl.type === 'link' || bl.type === 'clinic') n[bl.id] = sayL(Object.fromEntries(LANGS.map((lg) => [lg, String((bl.title && bl.title[lg]) || '').replace(/[.:،]+$/, '') + '. ' + ((bl.text && bl.text[lg]) || '')])));
      else if (bl.type === 'lead' || bl.type === 'tip') n[bl.id] = sayL(bl.text);
      else if (bl.type === 'anim') { if (hasText(bl.title)) n[bl.id] = sayL(bl.title); } // without a title it reads anim.<name>.title
      else if (bl.type === 'alert' || bl.type === 'dont') {
        n[bl.id] = sayL(bl.title);
        for (const it of bl.items || []) if (it && it.id) n[it.id] = sayL(it.text);
      }
    }
    return n;
  }
  // Same as tools/build.py: the narration text of every block, and the recording order for the studio.
  function rebuildNarration(b) {
    const old = b.narration || {}, n = {};
    for (const k in old) if (k.startsWith('ui.')) n[k] = old[k];
    for (const [tid, t] of Object.entries(b.topics)) Object.assign(n, topicNarration(tid, t));
    for (const k in old) if (k.split('.')[0] === 'vaccines' && b.topics.vaccines) n[k] = old[k];
    // the animations' own lines (scenes, titles, picker) come from the app's build and are edited under Words
    for (const k in old) if (k.startsWith('anim.')) n[k] = old[k];
    b.narration = n;
    // recording order: interface lines, then page by page; an animation's lines follow the first page that shows it
    const keys = Object.keys(n), order = keys.filter((k) => k.startsWith('ui.')), seen = new Set(order), owner = {};
    const byTopic = {};
    for (const k of keys) { const tid = k.split('.')[0]; (byTopic[tid] = byTopic[tid] || []).push(k); }
    for (const sec of ['children', 'women', 'everyone', ...[...PAGE_LISTS].sort()]) for (const tid of b.sections[sec] || []) {
      const ids = (byTopic[tid] || []).filter((k) => k === tid + '.title' || k.startsWith(tid + '.')), t = b.topics[tid] || {};
      for (const bl of [...(t.blocks || []), ...(t.anims || [])]) if (bl && bl.type === 'anim') ids.push(...animBlockIds(b, bl).filter((k) => k in n && k.startsWith('anim.')));
      for (const k of ids) if (!seen.has(k)) { seen.add(k); order.push(k); if (!(k in owner)) owner[k] = tid; }
    }
    for (const k of keys) if (k.startsWith('anim.') && !seen.has(k)) { seen.add(k); order.push(k); }
    b.order = order;
    normAudio(b);
    b.packs = { ...(b.packs || {}), order: PACKS, ids: packIds(b, owner) };
    return b;
  }
  // book.audio is keyed by slot ("fa-f"); an older book keyed by language gets its clips moved to the woman's voice.
  function normAudio(b) {
    const a = b.audio && typeof b.audio === 'object' ? b.audio : {};
    for (const lg of LANGS) if (a[lg] && typeof a[lg] === 'object') { a[lg + '-f'] = { ...a[lg], ...(a[lg + '-f'] || {}) }; delete a[lg]; }
    for (const s of SLOTS) a[s] = a[s] || {};
    b.audio = a;
    return b;
  }
  // Same rule as tools/build.py: which audio pack each clip downloads in (urgent first, then children, women, everyone).
  function packIds(b, owner = {}) {
    const urgentTopics = new Set((b.config && Array.isArray(b.config.urgentTopics) && b.config.urgentTopics) || URGENT_TOPICS);
    const urgentIds = new Set();
    for (const t of Object.values(b.topics || {})) for (const bl of (t && t.blocks) || []) {
      if (bl && bl.type === 'alert' && bl.level === 'urgent') { urgentIds.add(bl.id); for (const it of bl.items || []) urgentIds.add(it.id); }
    }
    const ids = Object.fromEntries(PACKS.map((p) => [p, []]));
    const inOrder = new Set(b.order || []), sec = {};
    for (const s of PACKS.slice(1)) for (const tid of (b.sections || {})[s] || []) if (!(tid in sec)) sec[tid] = s;
    const keys = [...(b.order || []), ...Object.keys(b.narration || {}).filter((k) => !inOrder.has(k))];
    for (const k of keys) {
      const tid = owner[k] || k.split('.')[0];
      const p = k.startsWith('ui.') || urgentTopics.has(tid) || k === tid + '.title' || urgentIds.has(k) ? 'urgent' : sec[tid] || 'everyone';
      ids[p].push(k);
    }
    return ids;
  }

  // The check before publishing. With partial, only the parts given are checked, each on its own (the server checks the
  // editor's changed units this way; things that need the whole app book, such as "this topic exists", are left to the page).
  function checkBook(b, partial) {
    const errors = [], warnings = [], seen = new Map();
    const E = (msg, topic) => errors.push(topic ? { msg, topic } : { msg }), W = (msg, topic) => warnings.push(topic ? { msg, topic } : { msg });
    const checkL = (where, L, maxw, tid) => {
      if (!L || typeof L !== 'object') { E(`${where}: the text is missing.`, tid); return; }
      for (const lg of LANGS) {
        const v = L[lg];
        if (typeof v !== 'string' || !v.trim()) { E(`${where}: the ${LN[lg]} text is empty.`, tid); continue; }
        if (lg !== 'en') {
          if (/[0-9]/.test(v)) W(`${where}: the ${LN[lg]} text has English digits (0-9). Use ۰-۹.`, tid);
          if (/[A-Za-z]{2,}/.test(v)) W(`${where}: the ${LN[lg]} text has English letters in it.`, tid);
          if (lg === 'fa' && /[ټډړږښګڼېۍ]/.test(v)) W(`${where}: the Dari text has Pashto-only letters.`, tid);
        }
        if (maxw && lg === 'en') { const n = v.trim().split(/\s+/).length; if (n > maxw) W(`${where}: ${n} English words. Try to keep it to ${maxw} or fewer.`, tid); }
      }
    };
    const regId = (where, id, tid) => {
      if (typeof id !== 'string' || !ID_RE.test(id)) { E(`${where}: the id "${id == null ? '' : id}" is not allowed (small English letters, numbers, hyphens and dots only).`, tid); return; }
      if (seen.has(id) && seen.get(id) !== where) E(`${where}: the id "${id}" is used twice (also at ${seen.get(id)}).`, tid);
      seen.set(id, where);
    };
    const checkIcon = (where, ic, required, tid) => {
      if (ic == null || ic === '') { if (required) E(`${where}: choose an icon.`, tid); return; }
      if (!ICON_SET.has(ic)) E(`${where}: "${ic}" is not one of the app's icons.`, tid);
    };
    // pictures and animations the app has (written by tools/build.py); a book from before they existed has none
    const PICS = new Set(Array.isArray(b.pictures) ? b.pictures : []), AN = b.anims || {}, AG = AN.groups || {}, AIDS = AN.ids || {};
    function checkAnim(w, bl, tid) {
      if (partial) { if (typeof bl.anim !== 'string' || !bl.anim) E(`${w}: choose one of the app's animations.`, tid); else if (bl.title != null && hasText(bl.title)) checkL(`${w} title`, bl.title, 7, tid); return; }
      if (typeof bl.anim !== 'string' || !(AIDS[bl.anim] || AG[bl.anim])) { E(`${w}: choose one of the app's animations.`, tid); return; }
      if (bl.pick != null && bl.pick !== '' && !(AG[bl.anim] || []).includes(bl.pick)) E(`${w}: "${bl.pick}" is not one of the choices of "${bl.anim}".`, tid);
      if (bl.title != null && hasText(bl.title)) checkL(`${w} title`, bl.title, 7, tid);
      const need = bl.pick ? [...animNeeded(b, bl.anim).slice(0, 2 + (AG[bl.anim] || []).length), ...animNeeded(b, bl.pick)] : animNeeded(b, bl.anim);
      const miss = need.filter((k) => !(b.narration || {})[k]);
      if (miss.length) E(`${w}: the spoken lines of this animation are not in the book yet (${miss.slice(0, 3).join(', ')}${miss.length > 3 ? ' …' : ''}). They come with the app's own build.`, tid);
    }
    for (const [key, t] of Object.entries(b.topics || {})) {
      if (key === 'vaccines') { if (!partial) checkVaccines(t); continue; }
      const tid = t && t.id, name = `Topic "${(t && t.title && t.title.en) || key}"`;
      if (!tid || !ID_RE.test(tid) || tid !== key) { E(`${name}: the topic id is missing or wrong.`, key); continue; }
      if (!SECTIONS.includes(t.section)) E(`${name}: choose a section (children, women or everyone).`, tid);
      checkL(`${name} › title`, t.title, 6, tid);
      checkL(`${name} › summary`, t.summary, 12, tid);
      if (t.icon) checkIcon(`${name} › icon`, t.icon, false, tid);
      const blocks = t.blocks;
      if (!Array.isArray(blocks) || !blocks.length) { E(`${name}: has no blocks.`, tid); continue; }
      if (!blocks[0] || blocks[0].type !== 'lead') E(`${name}: the first block must be the opening sentence (lead).`, tid);
      const counts = {};
      blocks.forEach((bl, n) => {
        if (!bl || typeof bl !== 'object') { E(`${name} › block ${n + 1}: the block is empty.`, tid); return; }
        const ty = bl.type, w = `${name} › block ${n + 1} (${BLOCK_TYPES[ty] || ty})`;
        counts[ty] = (counts[ty] || 0) + 1;
        if (!BLOCK_TYPES[ty]) { E(`${w}: unknown kind of block.`, tid); return; }
        regId(w, bl.id, tid);
        if (typeof bl.id === 'string' && !bl.id.startsWith(tid + '.')) E(`${w}: its id must start with "${tid}."`, tid);
        if (!partial && (ty === 'step' || ty === 'link') && bl.picture != null && bl.picture !== '' && !PICS.has(bl.picture)) E(`${w}: there is no picture called "${bl.picture}" in the app.`, tid);
        if (ty === 'lead') checkL(`${w} text`, bl.text, 45, tid);
        else if (ty === 'step') { checkIcon(w, bl.icon, true, tid); checkL(`${w} title`, bl.title, 7, tid); checkL(`${w} text`, bl.text, 32, tid); }
        else if (ty === 'tip') { checkIcon(w, bl.icon, false, tid); checkL(`${w} text`, bl.text, 32, tid); }
        else if (ty === 'link') {
          checkIcon(w, bl.icon, false, tid); checkL(`${w} title`, bl.title, 7, tid); checkL(`${w} text`, bl.text, 32, tid);
          const m = LINK_RE.exec(String(bl.to || ''));
          if (!m) E(`${w}: choose where it goes (a tool, another topic, the home kit, the family record, the clinic finder, What is wrong? or the Emergency screen).`, tid);
          else if (m[2] && !TOOLS.includes(m[2])) E(`${w}: "${m[2]}" is not one of the app's tools.`, tid);
          else if (!partial && m[3] && !(b.topics || {})[m[3]]) E(`${w}: it goes to the topic "${m[3]}", which does not exist.`, tid);
        }
        else if (ty === 'anim') checkAnim(w, bl, tid);
        else if (ty === 'clinic') { checkIcon(w, bl.icon, false, tid); checkL(`${w} title`, bl.title, 7, tid); checkL(`${w} text`, bl.text, 32, tid); }
        else {
          if (ty === 'alert' && !['urgent', 'soon'].includes(bl.level)) E(`${w}: choose how urgent it is (red or amber).`, tid);
          checkL(`${w} title`, bl.title, 16, tid);
          if (!Array.isArray(bl.items) || !bl.items.length) { E(`${w}: has no items.`, tid); return; }
          bl.items.forEach((it, m) => {
            const iw = `${w} › item ${m + 1}`;
            if (!it || typeof it !== 'object') { E(`${iw}: the item is empty.`, tid); return; }
            regId(iw, it.id, tid);
            if (typeof it.id === 'string' && !it.id.startsWith((bl.id || '') + '.')) E(`${iw}: its id must start with "${bl.id}."`, tid);
            checkIcon(iw, it.icon, true, tid);
            checkL(iw, it.text, 14, tid);
          });
        }
      });
      if ((counts.anim || 0) > 2) W(`${name}: has ${counts.anim} animations. Try to keep it to 2 or fewer.`, tid);
      if ((counts.lead || 0) !== 1) E(`${name}: must have exactly one opening sentence (lead); it has ${counts.lead || 0}.`, tid);
      if (!((counts.step || 0) >= (counts.alert ? 1 : 2) && (counts.step || 0) <= 8)) // a reading page (what a number means) is one step and its alert boxes
        W(`${name}: has ${counts.step || 0} steps (aim for 3 to 7).`, tid);
      if (!Array.isArray(t.sources) || !t.sources.filter((s) => String(s).trim()).length) E(`${name}: add at least one source (where the advice comes from).`, tid);
    }
    function checkVaccines(d) {
      const v = 'Vaccines page';
      checkL(`${v} › title`, d.title); checkL(`${v} › summary`, d.summary);
      const lead = d.lead || {}; regId(`${v} › opening`, lead.id); checkL(`${v} › opening`, lead.text);
      let last = -1;
      (d.visits || []).forEach((x, n) => {
        const w = `${v} › visit ${n + 1}`; regId(w, x.id); checkL(`${w} age`, x.age);
        if (!Number.isInteger(x.ageDays) || (x.ageDays <= last && n > 0)) E(`${w}: the ages must go up from one visit to the next.`);
        last = Number.isInteger(x.ageDays) ? x.ageDays : last;
        (x.doses || []).forEach((dz, m) => { const dw = `${w} › vaccine ${m + 1}`; if (!ID_RE.test(dz.id || '')) E(`${dw}: bad id.`); checkL(`${dw} name`, dz.name); checkL(`${dw} protects against`, dz.protects); });
      });
      (d.notes || []).forEach((x, n) => { regId(`${v} › note ${n + 1}`, x.id); checkIcon(`${v} › note ${n + 1}`, x.icon, false); checkL(`${v} › note ${n + 1}`, x.text); });
      (d.anims || []).forEach((x, n) => { const w = `${v} › animation ${n + 1}`; regId(w, x.id); if (x.type !== 'anim') E(`${w}: must be an animation.`); checkAnim(w, x); });
      if (d.women) { regId(`${v} › women's part`, d.women.id); checkL(`${v} › women's part title`, d.women.title); checkL(`${v} › women's part text`, d.women.text); (d.women.doses || []).forEach((x, n) => checkL(`${v} › women's dose ${n + 1}`, x.when)); }
    }
    if (!partial) {
      // section lists
      const listed = new Set();
      for (const s of Object.keys(b.sections || {})) if (Array.isArray(b.sections[s])) for (const id of b.sections[s]) { listed.add(id); if (!b.topics[id]) E(`The ${s} list names "${id}", but there is no such topic.`); }
      // the Emergency screen: each age's "not breathing" page and its other pages
      for (const a of (b.config || {}).emergency || []) for (const id of [a.cpr, ...(a.topics || [])]) if (id && !b.topics[id]) E(`The Emergency screen (${a.id}) names "${id}", but there is no such topic.`);
      for (const id of Object.keys(b.topics || {})) if (!listed.has(id)) W(`Topic "${id}" is not in any section, so nobody can open it.`, id);
      // home screen
      if (!Array.isArray((b.config || {}).home) || !b.config.home.length) W('The home screen has no parts switched on.');
      // Mo's rule: the Home tab's lists (config.lists ... tab "house") give no medical advice; urgent signs live on the Health side
      for (const [name, l] of Object.entries((b.config || {}).lists || {})) if (l && l.tab === 'house') for (const tid of (b.sections || {})[name] || []) for (const bl of (((b.topics || {})[tid] || {}).blocks || [])) if (bl && (bl.type === 'alert' || bl.type === 'clinic')) W(`${bl.id}: this page is on the Home tab (${name}), which gives no medical advice. Move the box to a Health page and link to it with a red link row.`, tid);
    }
    // words on buttons and spoken interface lines
    for (const [k, L] of Object.entries(b.ui || {})) {
      const empty = LANGS.filter((lg) => !String((L && L[lg]) || '').trim());
      if (empty.length && empty.length < 3) W(`Words "${k}": the ${empty.map((x) => LN[x]).join(' and ')} text is empty.`);
      for (const ph of String((L && L.en) || '').match(/\{\w+\}/g) || []) for (const lg of ['fa', 'ps']) if (L[lg] && !L[lg].includes(ph)) E(`Words "${k}": the ${LN[lg]} text must keep ${ph} (the app puts a number there).`);
    }
    for (const [k, L] of Object.entries(b.narration || {})) if (k.startsWith('ui.')) checkL(`Spoken line "${k}"`, L);
    // places
    const fids = new Set(), ftypes = Object.keys(b.ui || {}).filter((k) => k.startsWith('ft_')).map((k) => k.slice(3)), svcs = Object.keys(b.ui || {}).filter((k) => k.startsWith('svc_')).map((k) => k.slice(4));
    ((b.facilities || {}).facilities || []).forEach((f, n) => {
      if (!f || typeof f !== 'object') { E(`Place ${n + 1}: the place is empty.`); return; }
      const w = `Place ${n + 1} "${(f.name && f.name.en) || f.id || ''}"`;
      if (typeof f.id !== 'string' || !ID_RE.test(f.id)) E(`${w}: bad id.`); else if (fids.has(f.id)) E(`${w}: the id "${f.id}" is used twice.`);
      fids.add(f.id);
      checkL(`${w} › name`, f.name);
      if (typeof f.lat !== 'number' || typeof f.lon !== 'number' || !isFinite(f.lat) || !isFinite(f.lon) || Math.abs(f.lat) > 90 || Math.abs(f.lon) > 180) E(`${w}: the location is wrong. Latitude must be a number between -90 and 90 and longitude between -180 and 180 (Samangan is about 36, 68).`);
      if (!STATUSES.includes(f.status)) E(`${w}: status must be open, unknown or closed.`);
      if (ftypes.length && !ftypes.includes(f.type || 'other')) E(`${w}: "${f.type}" is not a known type of place.`);
      for (const s of f.services || []) if (svcs.length && !svcs.includes(s)) E(`${w}: "${s}" is not a known service.`);
    });
    return { errors, warnings };
  }

  // One changed unit as the editor page sends it: checked for its shape and cleaned, before the server keeps it.
  // Returns { v } (null for a deleted topic) or { error } in plain words.
  function cleanUnit(k, v) {
    const i = k.indexOf(':'), kind = i < 0 ? k : k.slice(0, i), id = i < 0 ? '' : k.slice(i + 1);
    const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
    if (kind === 'topic') {
      if (!TOPIC_ID_RE.test(id) || id === 'vaccines') return { error: 'The topic id must be small English letters, numbers and hyphens, like "skin-infection". The vaccine page is changed in the app files.' };
      if (v === null) return { v: null };
      if (!isObj(v) || v.id !== id) return { error: `The topic "${id}" was not sent whole. Reload the page and try again.` };
      if (!SECTIONS.includes(v.section)) return { error: 'Choose a section: children, women or everyone.' };
      if (!Array.isArray(v.blocks) || !v.blocks.every(isObj)) return { error: 'The topic has no blocks.' };
      return { v };
    }
    if (kind === 'list') {
      if (!LISTS.includes(id) || !Array.isArray(v)) return { error: `There is no topic list called "${id}".` };
      return { v: [...new Set(v.filter((x) => typeof x === 'string' && TOPIC_ID_RE.test(x)))] };
    }
    if (kind === 'home') return Array.isArray(v) ? { v: [...new Set(v.filter((x) => typeof x === 'string' && HOME_MODULES[x]))] } : { error: 'Nothing to save.' };
    if (kind === 'ui') return /^[A-Za-z0-9_.-]{1,80}$/.test(id) && isObj(v) ? { v: cleanL(v) } : { error: `"${id}" is not one of the app's words.` };
    if (kind === 'say') return (id.startsWith('ui.') || id.startsWith('anim.')) && ID_RE.test(id) && isObj(v) ? { v: cleanL(v) } : { error: `"${id}" is not a spoken interface line.` };
    if (kind === 'facilities') return Array.isArray(v) && v.every(isObj) ? { v } : { error: 'Nothing to save.' };
    if (kind === 'search') {
      // the symptom finder's words for one topic (js/search.js): lists of short phrases per language, and danger words
      if (!TOPIC_ID_RE.test(id) || !isObj(v)) return { error: 'No such topic.' };
      const clean = {};
      for (const f of ['fa', 'ps', 'lat', 'en', 'danger']) {
        const L = Array.isArray(v[f]) ? [...new Set(v[f].filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, 80)).filter(Boolean))].slice(0, 300) : [];
        if (L.length) clean[f] = L;
      }
      if (v.urgent === true) clean.urgent = true;
      return { v: Object.keys(clean).length ? clean : null };
    }
    return { error: 'Unknown change.' };
  }
  // The editor's draft: the app's book with the editor's changes ({ key: { v, base, ts } }) laid over it, the same way
  // phones do it (OV = js/overlay.js). superseded: changes the app made again after the editor did (phones show the app's).
  function draftOf(app, changes, OV, retired) {
    const units = Object.keys(changes).map((k) => ({ k, v: changes[k].v, base: changes[k].base, ts: changes[k].ts }));
    const r = OV.applyOverlay(app, { format: OV.FORMAT, version: '', units, say: {}, audio: {} });
    const b = r.book;
    b.retired = (retired || []).slice();
    for (const s of SECTIONS) if (!Array.isArray((b.sections = b.sections || {})[s])) b.sections[s] = [];
    if (!b.facilities || !Array.isArray(b.facilities.facilities)) b.facilities = { ...(b.facilities || {}), facilities: [] };
    rebuildNarration(b);
    return { book: b, superseded: r.skipped.filter((k) => k !== 'topic:vaccines') };
  }
  // A draft kept the old way (the whole book, before 8 October 2026), against the app's book now. Parts with a save
  // time are the editor's changes (dated); the other differences (undated) are mostly older app text, from before save
  // times were kept. A part missing from the old draft is one the app added later, unless the editor deleted that
  // topic (its id was retired): so an old draft can never take away the app's new pages.
  function oldChanges(old, base, app, OV) {
    const edits = old.edits || {}, ret = new Set(old.retired || []), dated = [], undated = [];
    for (const k of new Set([...OV.unitKeys(old), ...OV.unitKeys(app)])) {
      if (k === 'topic:vaccines') continue;
      const ov = OV.getUnit(old, k), av = OV.getUnit(app, k);
      if (OV.jsonOf(ov) === OV.jsonOf(av)) continue;
      const v = ov === undefined ? null : ov;
      if (+edits[k] > 0) dated.push({ k, v, base: OV.fp(base ? OV.getUnit(base, k) : av), ts: +edits[k] });
      else if (ov !== undefined || (k.startsWith('topic:') && ret.has(k.slice(6)))) undated.push(k);
    }
    return { dated, undated };
  }
  // a unit's name in plain words, for messages
  const unitName = (k) => (k.startsWith('topic:') ? 'topic ' + k.slice(6) : k.startsWith('list:') ? 'topic list ' + k.slice(5) : k.startsWith('ui:') ? 'words ' + k.slice(3)
    : k.startsWith('say:') ? 'spoken line ' + k.slice(4) : k.startsWith('search:') ? 'search words ' + k.slice(7) : k === 'home' ? 'home screen' : k === 'facilities' ? 'places' : k);

  return { LANGS, SLOTS, PACKS, URGENT_TOPICS, SECTIONS, PAGE_LISTS, LISTS, TOOLS, LINK_RE, ID_RE, TOPIC_ID_RE, ICONS, ICON_SET, BLOCK_TYPES, HOME_MODULES, STATUSES,
    sayL, hasText, cleanL, animNeeded, animBlockIds, topicNarration, rebuildNarration, normAudio, packIds, checkBook, cleanUnit, unitName, draftOf, oldChanges };
}
