// "Your certificate" (P25b, C4.2), #/cert/<pathway>: the pathway's title, the name to print (one variable, never
// kept or sent), "Qalam does not keep this name", and "Print or save". The first time, the phone asks the server
// (after the consent screen where she has none, and after sending her waiting events); then the paper is on the phone
// and prints again with no request. On the hub with its printer, the queue prints it with an empty line instead, and
// the name box is not shown. modules/cert.js has the rules.

import * as account from '../account.js';
import * as graph from '../graph.js';
import * as hub from '../hub.js';
import { getLang, s } from '../i18n.js';
import * as certs from '../modules/cert.js';
import { speak } from '../speech.js';
import * as state from '../state.js';
import { fill, h, icon, plain, said, speakerBtn, toast, topbar } from '../ui.js';
import { saidNotNow } from './signup.js';

export default async function certScreen([path = '']) {
  const c = state.child();
  const x = graph.findPathway(path);
  const back = x ? '#/subject/' + encodeURIComponent(x.g.subject) : '#/home';
  const el = h('div', { class: 'screen cert-screen', 'data-speaks': '' });
  const body = h('div', { class: 'card lined pad-card stack' });
  const title = x ? plain(x.p.title) : '';
  fill(el, topbar({ back, title: s('cert_title'), child: true }), body);
  let name = '';                                  // the typed name: here only, gone when the screen closes
  let clean = null;
  const line = (text, cls = '') => h('div', { class: 'row top' }, h('p', { class: 'grow ' + cls }, text),
    speakerBtn(() => speak(text, getLang()), { size: 'sm' }));
  const say = (text) => fill(body, h('div', { class: 'row' }, h('h2', { class: 'grow', dir: 'auto' }, title)), line(text, 'lead'));

  if (!x || !certs.canCert(c) || !x.p.certificate) {
    say(s('no_lessons'));
    return { el, tab: 'lessons' };
  }

  function draw(cert) {
    const kept = certs.paperOf(cert) || {};
    const hubbed = certs.hubPrints();
    // a plain box in no form, with no `name` attribute: what she types stays in `name`
    const input = h('input', { class: 'nick cert-in', type: 'text', autocomplete: 'off', autocapitalize: 'words',
      spellcheck: 'false', maxlength: 60, dir: 'auto', 'aria-label': s('cert_name'),
      onInput: (e) => { name = e.target.value; } });
    const when = kept.months ? s('cert_when', { n: kept.lessons, month: kept.months[getLang()] || cert.month }) : null;
    const go = said(h('button', { type: 'button', class: 'btn warm big', onClick: () => print(cert, kept) },
      icon('printer', 28, 2.4), s(hubbed ? 'print_it' : 'cert_print')));
    fill(body,
      h('div', { class: 'row' }, h('h2', { class: 'grow', dir: 'auto' }, title),
        speakerBtn(() => speak([title, when].filter(Boolean).join('. '), getLang()), { size: 'sm' })),
      when ? h('p', { class: 'muted small' }, when) : null,
      hubbed ? line(s('cert_hub_note')) : [line(s('cert_name')), input, line(s('cert_forget'), 'muted small')],
      go,
      h('p', { class: 'muted small' }, s('cert_number'), ' ', h('span', { class: 'm', dir: 'ltr' }, cert.id)));
  }

  async function print(cert, kept) {
    if (certs.hubPrints()) {
      try {
        await hub.certPrint({ id: cert.id, lang: kept.lang || getLang(), lessons: kept.lessons || 1 }, (state.child() || {}).token);
        toast(s('cert_sent'));
      } catch {
        toast(s('cert_failed'));
      }
      return;
    }
    if (!kept.paper) { toast(s('cert_failed')); return; }
    if (clean) clean();
    clean = certs.printPaper(kept.paper, name, cert.id);
  }

  async function ask() {
    const cur = state.child();
    if (!cur.consent) {
      if (hub.online() && !saidNotNow(cur.id)) { location.replace('#/consent/cert.' + path); return; }
      say(s('cert_consent'));
      return;
    }
    if (!hub.online()) { say(s('cert_offline')); return; }
    fill(body, h('p', { class: 'empty' }, '…'));
    try {
      await account.sync();                       // her token, and the events still waiting on the phone
      const me = state.child();
      if (!me.token) { say(s('cert_offline')); return; }
      draw(await certs.earn(me, x, getLang()));
    } catch (e) {
      say(e.status === 409 ? s('cert_missing') : e.status === 429 ? s('cert_wait') : e.status === 0 ? s('cert_offline')
        : s('cert_failed'));
    }
  }

  const have = certs.certOf(c, x.p.id);
  if (have && certs.paperOf(have)) draw(have); else ask();     // a paper the phone lost is asked for again
  return { el, tab: 'lessons', cleanup: () => { name = ''; if (clean) clean(); } };
}
