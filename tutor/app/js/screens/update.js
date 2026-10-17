// "Please update Qalam" (P23, item 15): the one full-screen card in the Android app when this version is older than
// the server's `apk.min` (/api/hello). Download opens /get in the phone's browser; the app never installs updates
// itself. Credits stay open; nothing else does until she updates.

import { getLang, s } from '../i18n.js';
import * as hub from '../hub.js';
import { speak } from '../speech.js';
import { h, icon, said, speakerBtn } from '../ui.js';

export default function update() {
  const lines = [s('update_title'), s('update_text')].join('. ');
  return { el: h('div', { class: 'screen update' },
    h('div', { class: 'stack pad update-card' },
      h('span', { class: 'nowpic', 'aria-hidden': 'true' }, icon('download', 56, 2)),
      h('div', { class: 'row' }, h('h1', { class: 'grow' }, s('update_title')), speakerBtn(() => speak(lines, getLang()), { size: 'sm' })),
      h('p', { class: 'lead' }, s('update_text')),
      said(h('a', { class: 'btn primary big', href: hub.url('/get/') }, icon('download', 24), s('download'))))), tab: null };
}
