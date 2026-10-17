// How long a phone takes to open her school bag's code (WEBSITE.md 3.6, W5): PBKDF2-HMAC-SHA256 at bag.js ROUNDS, in
// Chromium with its CPU slowed 1, 4 and 6 times (Chrome's own "low-end mobile" setting is 4; 6 stands in for an
// Android Go phone until one is timed, W10), both ways the app runs it: the browser's own crypto.subtle (online and
// the Android app) and the vendored @noble/hashes (the hub's plain http). It writes nothing; the numbers it prints go
// in WEBSITE.md "W5". The target is 1.5 s on the slowest pilot phone, with 50 000 rounds the floor.
//
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROMIUM=/path/to/chrome node tools/bag_timing.mjs [--runs 3]

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const APP = fileURLToPath(new URL('../app/', import.meta.url));
const runs = Number(process.argv[process.argv.indexOf('--runs') + 1]) || 3;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = path === '/' ? '<!doctype html><title>bag timing</title>' : readFileSync(join(APP, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const cdp = await page.context().newCDPSession(page);
  for (const rate of [1, 4, 6]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    for (const native of [true, false]) {
      const times = await page.evaluate(async ({ native, runs }) => {
        const bag = await import('/js/bag.js');
        const out = [];
        for (let i = 0; i < runs; i++) {
          const t0 = performance.now();
          await bag.keys(bag.newCode(), { native });
          out.push(Math.round(performance.now() - t0));
        }
        return { times: out, rounds: bag.ROUNDS };
      }, { native, runs });
      console.log(`CPU ÷${rate}, ${native ? 'crypto.subtle' : 'vendored PBKDF2'}: ${times.times.join(', ')} ms `
        + `(${times.rounds} rounds, with HKDF)`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
