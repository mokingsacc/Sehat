// The consent screen (DESIGN.md 7), #/consent/<then>, in the learner's look. Title: "Before you start · for the
// grown-up" in school bands, "Before you start" for adults. Four rows (five since W7) (what Qalam does, what it keeps, who sees it,
// stop any time), each an icon, one sentence and a speaker, read aloud in order on open; "Read all" opens the full
// text with a speaker per paragraph. Then two buttons of equal width: "Hold to agree" (3 seconds, a ring fills round
// it, a 30 ms vibration at the end, letting go early cancels) and "Not now".
// The words are the server's (`hello.consent` names the version; content/consent/<lang>/<version>.json), kept on the
// phone once read, so a grown-up can agree while the server is out of reach. The phone records {kind, version, at}
// and account.js sends it; nobody's name is asked. Without a text on the phone (first open, offline) only "Not now"
// is offered.
// W7 (3.6): a text that names the school bag (`bag: true`, the c texts) has a fifth row, the bag's line; agreeing to
// it makes her bag (a new code and its keys, on this phone) and shows "Her school bag is ready" before the next step.
// A learner who agreed to an older text is shown the new one once (main.js); "Not now" changes nothing.

import * as account from '../account.js';
import * as bagsync from '../bagsync.js';
import { getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import { hasVoice, speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, holdable, icon, said, speakerBtn, toast, topbar } from '../ui.js';
import * as signup from './signup.js';

const ROWS = [['book', 'does'], ['lock', 'keeps'], ['users', 'sees'], ['bag', 'bag'], ['stop', 'stop']];
const HOLD_MS = 3000;

export default async function consent([then = 'home']) {
  const c = state.child();
  const lang = getLang();
  const version = hub.consentVersion();
  const doc = version ? await hub.consentText(c.lang, version) : null;
  const title = s(c.band === 'ad' ? 'consent_title_self' : 'consent_title_school');
  const say = (t) => () => speak(t, lang);

  const leave = () => { location.hash = signup.next('consent', then); };
  const notNow = () => { signup.markNotNow(c.id); state.updateChild(c.id, { asked: true }); leave(); };
  const agree = async () => {
    account.agree(c.id, version);
    toast(s('agreed'));
    if (doc && doc.bag === true && !state.byId(c.id).bag) {
      fill(el.querySelector('.actions'), h('p', { class: 'muted', role: 'status' }, s('bag_wait')));
      await bagsync.make(c.id);
      account.sync().then(() => bagsync.syncLearner(c.id, { force: true }));   // it uploads once she has joined
      location.hash = `#/bag/ready/${then}`;
      return;
    }
    if (state.byId(c.id).bag) account.sync().then(() => bagsync.syncLearner(c.id));   // her bag reaches this relay too
    leave();
  };
  const rows = doc ? ROWS.filter(([, k]) => doc.rows && doc.rows[k]) : [];

  const full = h('div', { class: 'stack consent-full hidden' });
  if (doc) {
    fill(full, (doc.full || []).map((p) => h('div', { class: 'row top' }, h('p', { class: 'grow', dir: 'auto' }, p),
      speakerBtn(say(p), { size: 'sm' }))));
  }
  const readAll = h('button', { type: 'button', class: 'link', 'aria-expanded': 'false', onClick: () => {
    const open = full.classList.toggle('hidden') === false;
    readAll.setAttribute('aria-expanded', String(open));
  } }, icon('file', 20), s('read_all'));

  const hold = h('button', { type: 'button', class: 'btn primary' }, h('span', {}, s('hold_agree')));
  holdable(hold, { ms: HOLD_MS, buzz: 30, onDone: agree, onTap: () => speak(s('hold_3'), lang) });
  const no = h('button', { type: 'button', class: 'btn outline', onClick: notNow }, s('not_now'));

  const el = h('div', { class: 'screen consent' },
    topbar({ back: null, title }),
    doc && doc.draft ? h('div', { class: 'draft', 'data-silent': '' }, s('draft_note')) : null,
    doc ? h('div', { class: 'stack pad consent-rows' },
      rows.map(([ic, k]) => h('div', { class: 'row consent-row' },
        h('span', { class: 'ic' }, icon(ic, 28, 2.2)),
        h('p', { class: 'grow', dir: 'auto' }, doc.rows[k]),
        speakerBtn(say(doc.rows[k]), { size: 'sm' }))),
      readAll, full)
      : h('div', { class: 'empty' }, s('consent_offline')),
    h('div', { class: 'actions' }, doc ? said(hold, s('hold_agree')) : null, said(no)));

  // read in order on open: the title, then the four rows
  if (doc && hasVoice(lang)) {
    setTimeout(() => speak([title, ...rows.map(([, k]) => doc.rows[k])].join('. '), lang), 400);
  }
  return { el, tab: null };
}
