// Certificates on the phone (P25b, C4.2). The module has no slot: "Get my certificate" sits on the Done card and on a
// finished pathway's card, and opens #/cert/<pathway> (screens/cert.js).
// - Bands p1 to ad (a grown-up types for a young child), never ey; never for Quran or seerah (the graph has no
//   certificate there). The server reads her own events, so it needs her consent and her token.
// - The phone keeps `certs: [{path, id, month, server}]` per learner (state.js; `server` is the id of the server that
//   issued it, W4) and the paper the server drew for it (the cache, `cert.<id>`: no name in it), so "My certificate"
//   prints again with no request; it never asks twice.
// - The name she types lives in one variable on the certificate screen; it is written into the paper only as the
//   paper prints (`printPaper`), then the paper leaves the page. Never in storage, a URL, the title, an event, a log
//   or a request. On the hub the print queue gets the id only and the paper has an empty line.

import * as android from '../android.js';
import * as graph from '../graph.js';
import * as hub from '../hub.js';
import { allows, on } from '../modules.js';
import * as state from '../state.js';
import { bandLessons } from './plan.js';

export const canCert = (c) => !!c && c.band !== 'ey' && on('cert') && allows('cert', c.band);
export const certOf = (c, path) => ((c && c.certs) || []).find((x) => x.path === path) || null;
export const paperOf = (cert) => (cert ? state.cache('cert.' + cert.id) : null);

// the pathway's certificate can be asked for: it has one, she can have one, and every lesson of it is finished here
// (the server checks again, from her events); one she already has is always there to print again
export function ready(c, x) {
  if (!x || !x.p.certificate || !canCert(c)) return false;
  if (certOf(c, x.p.id)) return true;
  const plan = graph.pathwayPlan(c, x, bandLessons(c));
  return plan.lessons.length > 0 && plan.lessons.every((id) => !!(c.done && c.done[id]));
}

// ask the server; keep the id, the month and the paper. Throws the server's refusal (409 with `missing`, 429, 403).
export async function earn(c, x, lang) {
  const r = await hub.certEarn({ path: x.p.id, version: x.g.version, lang }, c.token);
  const certs = [...((c.certs || []).filter((y) => y.path !== x.p.id)),
    { path: x.p.id, id: r.id, month: r.month, ...(hub.id() ? { server: hub.id() } : {}) }];
  state.updateChild(c.id, { certs });
  state.cache('cert.' + r.id, { lang, lessons: r.lessons, months: r.months, url: r.url, paper: r.paper });
  return certOf(state.byId(c.id), x.p.id);
}

// the hub prints it from the queue, with the id only: the paper's name line stays empty
export const hubPrints = () => hub.home() === 'hub' && on('print');

const PRINT_CSS = `@media screen{.cert-print{display:none!important}}
@media print{body>*:not(.cert-print){display:none!important}html,body{margin:0;background:#fff}
@page{size:A4 landscape;margin:0}.cert-paper{page-break-inside:avoid}}`;

// print the paper in this page, with the typed name in its line, under a title that names no one; returns the
// clean-up, which also runs after the browser's print dialog closes
export function printPaper(paper, name, id) {
  document.querySelectorAll('.cert-print').forEach((el) => el.remove());
  const style = document.createElement('style');
  style.className = 'cert-print-style';
  style.textContent = (paper.css || '') + PRINT_CSS;
  const wrap = document.createElement('div');
  wrap.className = 'cert-print';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = paper.body || '';                  // the server's paper: no name in it
  const line = wrap.querySelector('.cert-name');
  if (line) line.textContent = String(name || '').trim().slice(0, 60);
  document.head.append(style);
  document.body.append(wrap);
  const before = document.title;
  document.title = `Qalam certificate ${id}`;
  let done = false;
  const clean = () => {
    if (done) return;
    done = true;
    wrap.remove();
    style.remove();
    document.title = before;
  };
  if (android.canPrint()) {
    android.print(document.title);                    // the phone lays the page out later: cleared when she leaves
  } else {
    globalThis.addEventListener('afterprint', clean, { once: true });
    globalThis.print();
  }
  return clean;
}
