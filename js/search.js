// Sehat smart symptom finder: an offline ranker for the book's OWN pages.
// It never writes advice: it only scores page ids (topics, sections of topics, tools and screens) for what someone
// typed or said, in Dari, Pashto, Latin letters ("kamar dard", "es-hal") or English. Plain ES module, no DOM, no network.
//
//   import { createSearch } from './search.js';
//   const S = createSearch(book);                 // book = content/book.json (book.search.pages holds the phrases)
//   S.rank('کمرم درد می‌کند', 'fa')               // → [{ id, target, route, score, danger }, …] best first
//
// id      a page key: a topic id ("fever"), a screen ("emergency", "kit", "near", "family", "children", "adults")
//         or a tool ("tool/breaths", "tool/reading/bp");
// target  the section to open inside a topic ("diarrhoea.zinc"), or null for the top of the page;
// route   the hash to open ("#/topic/diarrhoea/diarrhoea.zinc");
// danger  true when a danger phrase matched (not breathing, fits, heavy bleeding …), or when the best match is an urgent
//         page (Emergency section, "urgent": true): show the red Emergency badge. Danger results always come first.
//
// A meaning model (an optional download, later) plugs in with addRanker({ weight, rank(query, lang) → [{ id, score 0..1 }] })
// and rankAsync(); its scores are blended in, but it can never move a danger page down. See docs/CONTENT_SPEC.md.

export const SEARCH_VERSION = 1;

/* ------------------------------------------------------------------ normalisation ------------------------------------------------------------------ */
// Arabic, Persian and Pashto letter variants → one letter. Pashto letters fold to the Dari letter people type without a
// Pashto keyboard; letters that sound the same in Dari fold together (ص ث → س, ذ ض ظ → ز, ط → ت, ح → ه).
const AR = {
  'ي': 'ی', 'ى': 'ی', 'ې': 'ی', 'ۍ': 'ی', 'ئ': 'ی', 'ے': 'ی', 'ۑ': 'ی', 'ٸ': 'ی',
  'ك': 'ک', 'ڪ': 'ک', 'ګ': 'گ', 'ڭ': 'گ',
  'ة': 'ه', 'ە': 'ه', 'ۀ': 'ه', 'ہ': 'ه', 'ھ': 'ه', 'ۂ': 'ه', 'ۃ': 'ه',
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ٲ': 'ا', 'ٳ': 'ا', 'ٵ': 'ا',
  'ؤ': 'و', 'ۇ': 'و', 'ۆ': 'و', 'ٶ': 'و', 'ۄ': 'و',
  'ښ': 'ش', 'ږ': 'ژ', 'ځ': 'ز', 'څ': 'س', 'ټ': 'ت', 'ډ': 'د', 'ړ': 'ر', 'ڼ': 'ن', 'ٹ': 'ت', 'ڈ': 'د', 'ڑ': 'ر', 'ں': 'ن', 'ڕ': 'ر',
  'ص': 'س', 'ث': 'س', 'ذ': 'ز', 'ض': 'ز', 'ظ': 'ز', 'ط': 'ت', 'ح': 'ه', 'ء': '',
};
const AR_RE = new RegExp('[' + Object.keys(AR).join('') + ']', 'g');
const AR_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const DIGITS = /[۰-۹٠-٩]/g;
const toAsciiDigit = (d) => String((d.charCodeAt(0) & 0xF) % 10);

/** Letters, digits and spaces only; one form for each Arabic-script letter; Latin lower case without accents. */
export function normalize(text) {
  return String(text == null ? '' : text)
    .normalize('NFKC').toLowerCase()
    .replace(/[‌‍]/g, ' ') // a zero-width non-joiner separates parts of a word: treat it as a space (می‌کند → می کند)
    .normalize('NFD').replace(/\p{Mn}/gu, '') // harakat, hamza and madda above, Latin accents
    .replace(/[ـ​‎‏‪-‮⁦-⁩؜﻿]/g, '') // tatweel, bidi marks
    .replace(AR_RE, (c) => AR[c])
    .replace(DIGITS, toAsciiDigit)
    // Latin ezafe: "dard-e sar", "dard-e-sar", "dard e sar" → "dard sar"; other hyphens and apostrophes join ("es-hal" → "eshal")
    .replace(/([a-z])-(?:e|i|ye|yi)(?=[-\s]|$)/g, '$1 ').replace(/([a-z])['’`-]+(?=[a-z])/g, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Latin letters: one spelling for the many ways Dari and Pashto words are written in English letters
// (kh/x, gh/g, q/k, w/v, e/i, o/u, double letters, a final h after a vowel). English words go through it too.
function latFold(t) {
  t = t.replace(/ph/g, 'f').replace(/ch/g, 'ç').replace(/sh/g, 'ş').replace(/kh/g, 'x').replace(/gh/g, 'g').replace(/zh/g, 'j')
    .replace(/th/g, 't').replace(/dh/g, 'd').replace(/ck/g, 'k').replace(/c/g, 'k').replace(/q/g, 'k').replace(/w/g, 'v').replace(/y/g, 'i')
    .replace(/ou|oo|o/g, 'u').replace(/ee|ea|ie|ei|e/g, 'i').replace(/aa|â|ā/g, 'a');
  t = t.replace(/(.)\1+/g, '$1');
  if (t.length > 3) t = t.replace(/([aiu])h$/, '$1');
  return t;
}
const isAr = (t) => AR_SCRIPT.test(t);
const foldTok = (t) => (isAr(t) || /^\d/.test(t) ? t : latFold(t));

/* ------------------------------------------------------------------ word lists ------------------------------------------------------------------ */
// Words that carry no meaning for finding a page (checked on the word as typed, before Latin folding).
const STOP_RAW = {
  fa: 'و را به از در با که این ان اون او است هست اس استه بود شد شده شود میشود میشه میشد کرد کرده کند میکند میکنه میکنن میکنند دارد داره دارم داریم دارن دارند چه چی چرا چطور چطوری من تو ما شما ایشان مه ما اونا یک یه یکی همی همین هم برای بری بخاطر ده سره ام اش ها های ای تر ترین خو دیگه دیگر باید لطفا حالا مرا مره ره رو را چند کمی خیلی زیاده بسیار وقتی کدام چیزی یکدم ایقه اینقدر میباشد باشد ای اینه گاهی اول',
  ps: 'د په ته او چی چې می مې دې دی یی یې ئې مو زما ستا هغه دا دغه ده دي دے وو وه وي شو شوه شوی شوې شي شی کوي کوم کړي کړ کړه کړې کې کی سره له هم ډېر ډیر یو یوه څه څنګه ولې ولی لپاره باندې باندی پر ما زه لري لرو لری یم یو راته ورته ټول ډېره ډیره خو نو بیا اوس',
  en: 'a an the my our your his her their its it is are was were be been being am i im me we you he she they this that these those of in on at to for from with and or but has have had having do does did doing very so too what how why when where which who can could should would will please some any just really lot lots bit little got get gets getting feel feels feeling there about since keeps keep kind sort also again now today ill',
  lat: 'e i va wa ra ba az dar da pa ta ke ki ka ast as hast ase asta astan bud shud shod shuda shoda mesha mishe meshe misha mesh kad kard karda kada mekona mikona mekone mekunad mikunad mikone mikonad mekuna mekunan dara dare darad darum daram dari darem man mara mana mu tu shuma yak yag yaki hamin ham kho khu digar baraye kheli khaili khayli besyar ziad ziyad ziada chi che chira chetor chitor chand de aw ao chi me mi ye yi zama sta haga dagha dey day wi wu shu shwa shwe shi kawi kawey kri kre kay sara la hum der dir yaw yawa sa tsa sanga wale lapara lari laram larey yam yu rata warta tol tul kho no bya os',
};
const NEG_RAW = ['نه', 'نی', 'نیست', 'نیس', 'نمیتواند', 'نمیتانه', 'نمیتانم', 'نتوانست', 'نشي', 'نشی', 'نشو', 'نشوه', 'نشوو',
  'not', 'no', 'cannot', 'cant', 'dont', 'doesnt', 'isnt', 'wont', 'wasnt', 'didnt', 'unable', 'never', 'na', 'nest', 'nist', 'nis', 'nashi', 'nashe', 'nashey', 'nemetana', 'nametana', 'nametani'];
const NEG = '~neg';
// "می" starts a Dari verb (می‌کشد): dropped, except in words that only look like it
const MI_KEEP = /^(میوه|میده|میز|میخ|میان|مین|میل|میگرن|میکروب|میراث|میلیون|میاشت|میرمن|میره|میتی)/;
// endings tried when a word is not in the phrase list as typed (my/your/his, plurals, Pashto and Dari verb endings, English)
const SUF_AR = ['هایشان', 'هایتان', 'هایمان', 'هایش', 'هایم', 'هایت', 'های', 'ها', 'شان', 'تان', 'مان', 'گانی', 'گان', 'یژی', 'یژم', 'یدلی', 'یدل', 'یدو', 'یزی', 'ونه', 'انی', 'انو', 'انید', 'اند', 'یش', 'یم', 'یت', 'ام', 'ات', 'اش', 'ان', 'وی', 'ند', 'ید', 'ی', 'م', 'ت', 'ش', 'ه', 'و', 'د'];
const SUF_LAT_RAW = ['hayash', 'hayam', 'haya', 'ha', 'ashan', 'eshan', 'ash', 'esh', 'ish', 'am', 'at', 'an', 'on', 'una', 'ona', 'ana', 'ani', 'ane', 'ege', 'egi', 'ezhi', 'ize', 'ies', 'ing', 'ed', 'es', 's', 'ly', 'i', 'a', 'e', 'u', 'm', 't'];

const STOP = new Set();
for (const lg in STOP_RAW) for (const w of STOP_RAW[lg].split(/\s+/)) if (w) STOP.add(normalize(w));
const NEGS = new Set(NEG_RAW.map(normalize));
const SUF_LAT = [...new Set(SUF_LAT_RAW.map(latFold))].filter(Boolean).sort((a, b) => b.length - a.length);

// One token for the same idea in Dari, Pashto, Latin letters and English, so "طفلم تب دارد", "ماشوم تبه لري" and
// "child has fever" meet in the middle (and inflected forms: طفلم, تبش, fevers). Only words with one clear meaning.
const CONCEPT_RAW = {
  child: 'طفل طفلک طفلکم بچه بچیم بچم اولاد اولادم پسر پسرم پسرک دختر دخترم دخترک کودک فرزند فرزندم ماشوم ماشومه زوی زویه لور لورکۍ بچی هلک نجلۍ جینۍ tefl tifl tefel tifel bacha bache bachem bachim bacham awlad aulad pesar pisar pesaram dokhtar dukhtar dokhtaram dukhtaram mashum mashoom mashom zoy zoi halak child kid kids daughter boy girl toddler',
  baby: 'شیرخوار شیرخواره شیرخور shirkhor shirkhar shirkhwar baby babies infant infants',
  newborn: 'نوزاد نوزادم نوزادش nawzad nozad nawzaad newborn newborns',
  preg: 'حامله حاملگی امیدوار امیندواره امیندواري امیندوارۍ بلاربه hamila hamela hamile hamilagi hamelagi hamilegi umidwar amindwara umindwara amindwari umindwari blarba pregnant pregnancy expecting',
  pain: 'درد دردش دردم خوږ خوږیږي خوږېږي خوږیږی خوږه dard dardesh dardam khog khwag khogigi khwagigi khogegi khwagegi khogegi pain pains ache aches aching hurt hurts hurting painful',
  head: 'سر سرم سرش sar saram sarash head',
  back: 'کمر کمرم کمرش ملا kamar kamaram kamarash mla back',
  chest: 'سینه سینه‌ام سینه‌اش sina sine chest',
  belly: 'شکم شکمم شکمش نس ګېډه shikam shekam shkam nas belly stomach tummy abdomen abdominal',
  eye: 'چشم چشمم چشمش چشمان سترګه سترګې سترګو chashm cheshm chashmesh starga starge stargi eye eyes',
  ear: 'گوش گوشم گوشش غوږ غوږونه gosh gush ghwag ghwazh ear ears',
  nose: 'بینی دماغ پوزه bini dimagh damagh puza poza nose',
  throat: 'گلو گلویم گلویش ستونی ستوني galu gulu gelu stuni stunai throat',
  blood: 'خون خونش وینه وینې khun khoon wina weena blood bloody',
  bleed: 'خونریزی خونریزي khunrezi khunrizi bleeding bleed bleeds',
  breath: 'نفس نفسش نفسم تنفس ساه nafas nafasesh nafasam saa sah breath breathe breathing breaths',
  fever: 'تب تبش تبم تبه تبې tab tabe taba tabesh fever fevers feverish',
  cough: 'سرفه سلفه ټوخی ټوخي sulfa sulfah solfa sorfa surfa tokhay tukhay tokhai tukhai cough coughs coughing coughed',
  vomit: 'استفراغ قی کانګې کانګی estefragh istifragh qai qay kange kangay vomit vomits vomiting vomited',
  diarrhoea: 'اسهال eshal ishal isal eshaal esal ishaal diarrhoea diarrhea diarrohea diarhoea diarrea',
  fit: 'تشنج اختلاج tashannuj tashanoj tashanuj tashnuj tashannoj ikhtilaj akhtilaj fit fits seizure seizures convulsion convulsions convulsing fitting',
  unconscious: 'بیهوش بیهوشه behosh bihush behush unconscious',
  milk: 'شیر شیرم شیدې shir shide milk',
  burn: 'سوختگی سوخت سوخته سوځېدنه وسوځېد سوځیدلی sokhtagi sukhtagi sokht sukht burn burns burned burnt',
  poison: 'زهر مسموم zahr zaher zahar masmum poison poisoned poisoning',
  snake: 'مار mar snake snakes',
  scorpion: 'گژدم کژدم عقرب gazhdum kazhdum gazhdom gazdum larum scorpion scorpions',
  dog: 'سگ سپی سپي sag spay spi dog dogs',
  drown: 'غرق ډوب gharq garq dub dob drown drowned drowning',
  broken: 'شکست شکسته شکستگی مات ماته shikast shekast mat broken fracture fractured',
  sugar: 'شکر قند شکره shakar qand shakara sugar',
  pressure: 'فشار feshar fishar pressure',
  tired: 'خسته خستگی ستړی ستړیا khasta starai tired tiredness',
  worry: 'پریشان پریشانی تشویش اندېښنه pareshan parishan tashwish worry worried anxious anxiety worrying',
  sleep: 'خواب khab khaw sleep sleeping',
  rash: 'دانه دانې dana rash spots',
  swell: 'پندید پندیده پندیدن ورم پړسوب پړسېدلی پړسیدلې pundid punded parsob swollen swelling swelled',
  yellow: 'زرد زردی ژېړ ژېړی zard zardi yellow',
  hot: 'داغ گرم تود ګرم dagh garm tod hot',
  thin: 'لاغر ډنګر laghar lagar dangar thin skinny underweight',
  wound: 'زخم ټپ zakhm wound',
  urine: 'ادرار پیشاب متیازې idrar adrar peshab urine urinating peeing pee',
  stool: 'مدفوع غایطه stool stools poo',
  mother: 'مادر مادرم مور madar mother mum',
};
const CONCEPT = new Map();
for (const [c, words] of Object.entries(CONCEPT_RAW)) for (const w of words.split(/\s+/)) {
  const n = normalize(w); if (!n || n.includes(' ')) continue;
  CONCEPT.set(foldTok(n), '~' + c);
}
// a word, or the word without a my/his/plural ending, that is one of the ideas above
const CANON_SUF_AR = ['هایشان', 'هایش', 'هایم', 'های', 'ها', 'شان', 'یش', 'یم', 'ام', 'اش', 'ش', 'م', 'ی', 'ه'];
const CANON_SUF_LAT = [...new Set(['ash', 'esh', 'ish', 'am', 'at', 'ha', 'an', 'es', 's', 'i', 'e'].map(latFold))].sort((a, b) => b.length - a.length);
function canon(t) {
  const c = CONCEPT.get(t); if (c) return c;
  for (const s of isAr(t) ? CANON_SUF_AR : CANON_SUF_LAT) if (t.length - s.length >= 2 && t.endsWith(s)) { const b = CONCEPT.get(t.slice(0, -s.length)); if (b) return b; }
  return t;
}
/** For fuzzy matching: the written forms of each idea (a typo of "fever" still finds ~fever). */
export const conceptForms = () => CONCEPT;

/** Words of a text, normalised: stop words dropped, negation as one token "~neg", Dari "می" dropped, Latin folded. */
export function tokenize(text) { return words(text).map((x) => x.t); }
// the same, with each word's written form before it became an idea token (for joining "خون ریزی" → خونریزی)
function words(text) {
  const out = [];
  // Pashto لړم (scorpion) would fold to لرم ("I have"): keep it apart
  for (let w of normalize(String(text == null ? '' : text).replace(/لړم/g, 'گژدم')).split(' ')) {
    if (!w || STOP.has(w)) continue;
    if (NEGS.has(w)) { out.push({ t: NEG, r: NEG }); continue; }
    if (isAr(w)) {
      if (w.startsWith('نمی') && w.length > 3) { out.push({ t: NEG, r: NEG }); w = w.slice(3); }
      else if (w === 'نمی') { out.push({ t: NEG, r: NEG }); continue; }
      else if (w.startsWith('می') && w.length > 3 && !MI_KEEP.test(w)) w = w.slice(2);
      else if (w === 'می') continue;
      if (!w || STOP.has(w)) continue;
    } else if (/^n[ai]m[ie]/.test(w) && w.length > 5) { out.push({ t: NEG, r: NEG }); w = w.replace(/^n[ai]m[ie]/, ''); } // Latin "namekasha"
    const r = foldTok(w);
    out.push({ t: canon(r), r });
  }
  return out;
}

/* ------------------------------------------------------------------ fuzzy matching ------------------------------------------------------------------ */
// substitution costs: letters people mix up cost less than a full edit
const CLASSES = ['شخ', 'زجژگ', 'سچ', 'اعه', 'قغک', 'کگ', 'تد', 'aiu', 'kg', 'sz', 'vf', 'td', 'xh', 'şs', 'çj'];
const SUB = new Map();
for (const c of CLASSES) for (const a of c) for (const b of c) if (a !== b) SUB.set(a + b, a + b === 'تد' || a + b === 'دت' || a + b === 'td' || a + b === 'dt' ? 0.7 : 0.45);
const VOWELISH = new Set([...'اویهعaiu']);
// a 31-bit letter signature (look-alike letters share a bit) to skip words that cannot be within the allowed edits:
// each letter of the typed word whose bit is missing from a listed word costs at least one insert or delete
const CLS = new Map();
{ const root = (c) => { while (CLS.has(c) && CLS.get(c) !== c) c = CLS.get(c); return c; };
  for (const k of SUB.keys()) { const a = root(k[0]), b = root(k[1]); if (!CLS.has(a)) CLS.set(a, a); CLS.set(b, a); }
  for (const c of [...CLS.keys()]) CLS.set(c, root(c)); }
const bitOf = (c) => 1 << ((CLS.get(c) || c).charCodeAt(0) % 31);
export const sigOf = (w) => { let g = 0; for (const c of w) g |= bitOf(c); return g; };
const subCost = (a, b) => (a === b ? 0 : (SUB.has(a + b) ? SUB.get(a + b) : 1));
const indel = (c) => (VOWELISH.has(c) ? 0.6 : 1);
/** Weighted Damerau-Levenshtein (optimal string alignment) distance, or Infinity when over max. */
const EB = [new Float32Array(48), new Float32Array(48), new Float32Array(48)]; // reused rows: no garbage per word
export function editCost(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max + 0.01) return Infinity;
  if (lb + 1 > EB[0].length) for (let k = 0; k < 3; k++) EB[k] = new Float32Array(lb + 1);
  let p2 = null, p1 = EB[0], cur = EB[1], spare = EB[2];
  p1[0] = 0;
  for (let j = 1; j <= lb; j++) p1[j] = p1[j - 1] + indel(b[j - 1]);
  for (let i = 1; i <= la; i++) {
    cur[0] = p1[0] + indel(a[i - 1]);
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      let v = Math.min(p1[j] + indel(a[i - 1]), cur[j - 1] + indel(b[j - 1]), p1[j - 1] + subCost(a[i - 1], b[j - 1]));
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 0.8);
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > max + 0.01) return Infinity;
    const t = p2 || spare; p2 = p1; p1 = cur; cur = t;
  }
  return p1[lb];
}
// how many edits a word of this length may have and still match
const maxEdits = (t) => (t.length <= 3 ? 0.5 : t.length <= 5 ? 1 : t.length <= 8 ? 1.6 : 2);

/* ------------------------------------------------------------------ the index ------------------------------------------------------------------ */
// What a page key opens. Topic sections are "<topic>.<block>" keys; tools and screens are their own routes.
export const SCREENS = ['emergency', 'kit', 'near', 'family', 'children', 'adults'];
export function routeOf(key) {
  if (key.startsWith('tool/')) return '#/' + key;
  if (SCREENS.includes(key)) return '#/' + key;
  const dot = key.indexOf('.');
  return dot > 0 ? `#/topic/${key.slice(0, dot)}/${encodeURIComponent(key)}` : `#/topic/${key}`;
}
const pageOf = (key) => (key.startsWith('tool/') || SCREENS.includes(key) ? key : key.split('.')[0]);

const W_NEG = 1.2, W_NUM = 0.5;
const SIM_STEM = 0.92, SIM_STEM2 = 0.86, SIM_SPLIT = 0.9;

/**
 * Build the finder for a book. opts.auto (default true): also index each page's own title, summary, step titles and
 * danger-sign lines in the reader's language and English, as weaker evidence, so new pages are findable before
 * anyone writes phrases for them.
 */
export function createSearch(book, opts = {}) {
  const pages = (book.search && book.search.pages) || {};
  const topics = book.topics || {};
  const rankers = [];
  const byLang = new Map();

  function exists(key) {
    const p = pageOf(key);
    if (p.startsWith('tool/') || SCREENS.includes(p)) return true;
    const t = topics[p]; if (!t) return false;
    if (key === p) return true;
    if (p === 'vaccines') return key.startsWith('vaccines.');
    return (t.blocks || []).some((b) => b.id === key);
  }

  function build(lang) {
    const docs = [], vocab = new Map(), toks = [];
    const tokId = (t) => { let v = vocab.get(t); if (v === undefined) { v = toks.length; vocab.set(t, v); toks.push({ t, pages: new Set(), post: [] }); } return v; };
    const add = (key, text, kind) => {
      const ws = tokenize(String(text).replace(/^\?/, ''));
      if (!ws.length) return;
      const d = docs.length, page = pageOf(key);
      const ids = ws.map((w, i) => { const v = tokId(w); toks[v].pages.add(page); toks[v].post.push(d, i); if (kind === 'p' || kind === 'd') toks[v].cur = true; return v; });
      docs.push({ key, page, ids, kind });
    };
    for (const [key, e] of Object.entries(pages)) {
      if (!exists(key)) continue;
      for (const lg of ['fa', 'ps', 'lat', 'en']) for (const ph of e[lg] || []) add(key, ph, 'p');
      for (const ph of e.danger || []) add(key, ph, 'd');
    }
    if (opts.auto !== false) {
      const langs = [...new Set([lang, 'en'])].filter((x) => x === 'fa' || x === 'ps' || x === 'en');
      for (const [tid, t] of Object.entries(topics)) {
        for (const lg of langs) {
          if (t.title) add(tid, t.title[lg] || '', 't');
          if (t.summary) add(tid, t.summary[lg] || '', 's');
          for (const b of t.blocks || []) {
            if ((b.type === 'step' || b.type === 'link') && b.title) add(b.id, b.title[lg] || '', 'b');
            if (b.type === 'alert') for (const it of b.items || []) add(b.id, it.text[lg] || '', 'i');
          }
        }
      }
    }
    // word weights: rarer words (by how many pages use them) count more
    const P = new Set(docs.map((d) => d.page)).size || 1;
    const weight = new Float32Array(toks.length);
    toks.forEach((x, i) => { weight[i] = x.t === NEG ? W_NEG : /^\d+$/.test(x.t) ? W_NUM : 0.5 + Math.log(1 + P / x.pages.size); });
    for (const d of docs) d.W = d.ids.reduce((s, v) => s + weight[v], 0);
    // dictionary-aware stems: every word in the list that is another listed word plus an ending
    const base = new Map();
    const suffixes = (t) => (isAr(t) ? SUF_AR : SUF_LAT);
    toks.forEach((x, i) => {
      if (x.t[0] === '~') return;
      for (const s of suffixes(x.t)) if (x.t.length - s.length >= 2 && x.t.endsWith(s)) {
        const b = x.t.slice(0, -s.length);
        if (!base.has(b)) base.set(b, []); base.get(b).push(i);
      }
    });
    // words by length, for the fuzzy scan
    // written forms by length, for the fuzzy scan: every listed word, and every written form of an idea token in use
    const byLen = [];
    toks.forEach((x, i) => { if (x.t[0] !== '~') (byLen[x.t.length] = byLen[x.t.length] || []).push([x.t, i, sigOf(x.t)]); });
    for (const [w, c] of CONCEPT) { const v = vocab.get(c); if (v !== undefined) (byLen[w.length] = byLen[w.length] || []).push([w, v, sigOf(w)]); }
    const sorted = [].concat(...byLen.filter(Boolean)).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); // for "starts with" lookups
    const dangerPages = new Set(docs.filter((d) => d.kind === 'd').map((d) => d.page));
    // urgent pages: the Emergency section, the Emergency screen and pages marked "urgent" in the phrase list. When one
    // of them is the best match it gets the red badge even if no danger phrase matched word for word.
    const urgent = new Set(['emergency', ...((book.sections && book.sections.emergency) || [])]);
    for (const [key, e] of Object.entries(pages)) if (e.urgent) urgent.add(key);
    return { docs, vocab, toks, weight, base, byLen, sorted, dangerPages, urgent };
  }
  const idx = (lang) => { if (!byLang.has(lang)) byLang.set(lang, build(lang)); return byLang.get(lang); };

  // every listed word a typed word could be, with how sure we are (1 = same word)
  function forms(X, t, last) {
    const key = t + (last ? '\u0001' : '');
    const mk = X.memoKey || (X.memoKey = new Map());
    if (mk.has(key)) return mk.get(key);
    if (mk.size > 4000) mk.clear(); // typed words are remembered for speed; keep it small
    const out = new Map();
    const put = (v, s) => { if ((out.get(v) || 0) < s) out.set(v, s); };
    const exact = X.vocab.get(t);
    if (exact !== undefined) put(exact, 1);
    if (t === NEG || /^\d+$/.test(t)) { mk.set(key, out); return out; }
    for (const v of X.base.get(t) || []) put(v, SIM_STEM); // typed "کمر", listed "کمرم"
    if (t[0] !== '~') for (const s of isAr(t) ? SUF_AR : SUF_LAT) {
      if (t.length - s.length < 2 || !t.endsWith(s)) continue;
      const b = t.slice(0, -s.length), v = X.vocab.get(b), c = X.vocab.get(canon(b));
      if (v !== undefined) put(v, SIM_STEM); // typed "کمرم", listed "کمر"
      else if (c !== undefined) put(c, SIM_STEM2); // "burning" is near ~burn, but not sure enough for a danger badge
      for (const u of X.base.get(b) || []) put(u, SIM_STEM2); // typed "دردم", listed "دردش"
    }
    if (exact === undefined && t[0] !== '~') {
      const m = maxEdits(t), ar = isAr(t);
      const tb = [...new Set(t)].map((c) => [bitOf(c), indel(c)]);
      for (let L = Math.max(1, Math.floor(t.length - m)); L <= t.length + m; L++) for (const [w, v, g] of X.byLen[L] || []) {
        let low = 0; for (const [b, c] of tb) if (!(g & b)) low += c;
        if (low > m + 0.01 || isAr(w) !== ar) continue;
        const c = editCost(t, w, Math.min(m, maxEdits(w)));
        if (c !== Infinity && c > 0) put(v, Math.max(0.55, 1 - 0.2 * c));
      }
      // the last word may still be being typed: "اسه" → "اسهال"
      if (last && t.length >= (ar ? 2 : 3)) {
        const A = X.sorted; let lo = 0, hi = A.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (A[mid][0] < t) lo = mid + 1; else hi = mid; }
        for (let k = lo; k < A.length && A[k][0].startsWith(t); k++) { const [w, v] = A[k]; if (w.length > t.length) put(v, 0.5 + 0.4 * (t.length / w.length)); }
      }
    }
    mk.set(key, out);
    return out;
  }

  // "سینهبغل", "sardard": a word that is two listed words written together
  function split(X, t) {
    if (t.length < 4 || t === NEG || t[0] === '~') return null;
    let best = null;
    const known = (x) => { const c = canon(x); return X.vocab.has(c) ? [c, 1] : X.base.has(c) ? [c, SIM_STEM] : null; };
    for (let i = 2; i <= t.length - 2; i++) {
      const a = known(t.slice(0, i)), b = known(t.slice(i));
      if (a && b) { const sc = a[1] + b[1] + (i > 2 && i < t.length - 2 ? 0.01 : 0); if (!best || sc > best.sc) best = { a: a[0], b: b[0], sc }; }
    }
    return best ? [best.a, best.b] : null;
  }

  function analyse(X, query) {
    const typing = !/\s$/.test(query);
    const qw = words(query);
    const out = [];
    const cur = (t) => { const v = X.vocab.get(t); return v !== undefined && X.toks[v].cur; };
    qw.forEach(({ t, r }, i) => {
      const last = typing && i === qw.length - 1;
      const f = forms(X, t, last);
      let strong = false; for (const s of f.values()) if (s >= SIM_STEM2) { strong = true; break; }
      // "سردرد", "sardard": two listed words written together (also tried when the joined word is only in page texts)
      const sp = !cur(t) ? split(X, r) : null;
      if (sp) for (const p of sp) { const g = new Map(); for (const [v, s] of forms(X, p, false)) g.set(v, s * SIM_SPLIT); out.push(g); }
      if (strong || !sp) out.push(f);
      // "خون ریزی", "ear ache": one listed word written as two
      if (i + 1 < qw.length) { const m = canon(r + qw[i + 1].r); if (cur(m)) out.push(new Map([[X.vocab.get(m), 0.95]])); }
    });
    return out;
  }

  const docScoreOf = (doc, T, X) => { let x = 0; for (let p = 0; p < doc.ids.length; p++) x += X.weight[doc.ids[p]] * T.sim[p]; return x; };
  // phrase quality: how much of a phrase the query covers (a full match of a long phrase beats one shared word)
  const KIND = { p: 1, d: 1, t: 0.8, s: 0.45, b: 0.6, i: 0.5 };
  function lexical(query, lang) {
    const X = idx(lang || 'fa');
    const Q = analyse(X, query);
    if (!Q.length) return [];
    // best similarity of each word of each touched phrase, and which query word gave it
    const touched = new Map();
    Q.forEach((f, j) => {
      for (const [v, s] of f) {
        const post = X.toks[v].post;
        for (let k = 0; k < post.length; k += 2) {
          const d = post[k], p = post[k + 1];
          let T = touched.get(d); if (!T) { T = { sim: new Float32Array(X.docs[d].ids.length), q: new Int16Array(X.docs[d].ids.length).fill(-1) }; touched.set(d, T); }
          if (s > T.sim[p]) { T.sim[p] = s; T.q[p] = j; }
        }
      }
    });
    const credit = new Map(); // page → { c: Float32Array(Q.length), tgt: [key, score], danger }
    for (const [d, T] of touched) {
      const doc = X.docs[d];
      let M = 0, minS = 1, hit = 0;
      for (let p = 0; p < doc.ids.length; p++) { M += X.weight[doc.ids[p]] * T.sim[p]; if (T.sim[p] < minS) minS = T.sim[p]; if (T.sim[p] > 0) hit++; }
      const cov = M / doc.W;
      const full = minS >= 0.75;
      const auto = doc.kind !== 'p' && doc.kind !== 'd';
      if (!auto && (cov < 0.5 || hit / doc.ids.length < 0.6)) continue; // most of a phrase's words must be there
      if (auto && (cov < 0.34 || M < 1.2)) continue;
      const qual = (auto ? Math.sqrt(cov) : cov * cov * (full ? 1.3 : 1)) * KIND[doc.kind];
      let pc = credit.get(doc.page);
      if (!pc) { pc = { c: new Float32Array(Q.length), tgt: null, ts: 0, danger: false, best: 0 }; credit.set(doc.page, pc); }
      let docScore = 0;
      for (let p = 0; p < doc.ids.length; p++) {
        const j = T.q[p]; if (j < 0) continue;
        const c = X.weight[doc.ids[p]] * T.sim[p] * qual;
        if (c > pc.c[j]) pc.c[j] = c;
        docScore += c;
      }
      if (doc.kind === 'd' && cov >= 0.85) {
        // a danger phrase counts only when each of its words was typed as listed (Dari and Pashto endings allowed)
        let sure = true;
        for (let p = 0; p < doc.ids.length; p++) { const w = X.toks[doc.ids[p]].t; if (T.sim[p] < (isAr(w) || w[0] === '~' ? 0.9 : 0.99)) { sure = false; break; } }
        if (sure && (!pc.danger || docScoreOf(doc, T, X) > pc.dScore)) { pc.danger = true; pc.dScore = docScoreOf(doc, T, X); pc.dj = [...T.q].filter((j) => j >= 0); }
      }
      if (!auto && cov >= 0.6) pc.best = Math.max(pc.best, cov);
      if (doc.key !== doc.page && docScore >= pc.ts) { pc.ts = docScore; pc.tgt = doc.key; }
      if (doc.key === doc.page && docScore > pc.ts) { pc.ts = docScore; pc.tgt = null; }
    }
    const res = [];
    for (const [page, pc] of credit) {
      let score = 0.01 * pc.best; for (const c of pc.c) score += c; // (ties go to the page with a listed phrase)
      if (!pc.best && score < 1.6) continue; // only loose word overlaps: not a real match
      res.push({ id: page, target: pc.tgt, route: routeOf(pc.tgt || page), score, danger: pc.danger, pc });
    }
    // a danger query ("پدرم افتاد نفس نمی‌کشد" matches the danger words of the Emergency screen): another emergency page
    // that fits the whole query better, and also matched those same danger words, is a danger result too (cpr-adult)
    const top = res.filter((r) => r.danger).sort((a, b) => b.score - a.score)[0];
    if (top) for (const r of res) {
      if (r.danger || r.score <= top.score || !X.dangerPages.has(r.id)) continue;
      if (top.pc.dj.every((j) => r.pc.c[j] > 0)) r.danger = true;
    }
    // the best match is an urgent page (and not one of its calm sections, like "back pain" in Falls): red badge too
    const calm = res.filter((r) => !r.danger).sort((a, b) => b.score - a.score);
    const hard = Math.max(0, ...res.filter((r) => r.danger).map((r) => r.score));
    for (const r of calm) {
      if (r.score < calm[0].score || r.score <= hard || !(r.pc.best >= 0.6 || r.score >= 4) || !X.urgent.has(r.id)) break;
      if (!r.target || !pages[r.target] || pages[r.target].danger || pages[r.target].urgent) r.danger = true;
    }
    for (const r of res) delete r.pc;
    return res;
  }

  // readings typed as numbers: "140/90" or "فشارم ۱۵۰" (blood pressure), "تب ۳۹" or "38.5" (temperature), "شکر ۳۲۰",
  // "oxygen 88%": the reading checker for that device comes first (it reads the number and says what to do)
  const NUM_HINTS = [
    ['tool/reading/bp', /(^|\D)(1\d\d|[6-9]\d)\s*(\/|\\|بر|over|په)\s*([4-9]\d|1[0-4]\d)(\D|$)/, /(فشار|feshar|fishar|pressure|\bbp\b)\D{0,8}(1\d\d|[6-9]\d)(\D|$)/],
    ['tool/reading/temp', /(^|\D)(3[4-9]|4[0-2])[.,٫]\d(\D|$)/, /(تب|حرارت|درجه|tab|taba|fever|temp|temperature)\D{0,8}(3[4-9]|4[0-2])([.,٫]\d)?(\D|$)/],
    ['tool/reading/sugar', null, /(شکر|قند|shakar|qand|sugar|glucose)\D{0,8}(\d{2,3})(\D|$)/],
    ['tool/reading/spo2', /(^|\D)([6-9]\d|100)\s*[%٪]/, /(اکسیجن|oxygen|oksijan|spo2|saturation)\D{0,8}([6-9]\d|100)(\D|$)/],
  ];
  function numberHints(query) {
    const raw = normalize(String(query).replace(/[٫]/g, '.').replace(/[/\\%٪]/g, (c) => ` ${c === '/' || c === '\\' ? '/' : '%'} `)).replace(/(\d) (\.) (\d)/g, '$1.$3');
    const q = String(query).toLowerCase().replace(DIGITS, toAsciiDigit);
    const hints = [];
    for (const [id, alone, withWord] of NUM_HINTS) if ((alone && alone.test(q)) || (withWord && withWord.test(normalize(q).replace(/(\d) (\d)/g, '$1.$2')))) hints.push(id);
    return raw ? hints : [];
  }

  /**
   * Rank the book's pages for a query. Returns [{ id, target, route, score, danger }], danger pages first, best first.
   * lang: the reader's language ('fa' | 'ps' | 'en'); it chooses which page texts are also searched.
   */
  function rank(query, lang = 'fa', { limit = 5 } = {}) {
    const res = lexical(String(query || ''), lang);
    const hints = numberHints(String(query || ''));
    if (hints.length) {
      const best = Math.max(2, ...res.map((x) => x.score));
      for (const id of hints) {
        // the reading checker first, then the page that explains the numbers ("reading-bp"), when the book has it
        const page = 'reading-' + id.split('/')[2];
        for (const [k, sc] of [[id, best + 1], [page, best + 0.5]]) {
          if (k === page && !topics[page]) continue;
          const r = res.find((x) => x.id === k);
          if (r) r.score = Math.max(r.score, sc); else res.push({ id: k, target: null, route: routeOf(k), score: sc, danger: false });
        }
      }
    }
    return order(res, limit);
  }
  function order(res, limit) {
    res.sort((a, b) => (b.danger - a.danger) || (b.score - a.score));
    const top = res.length ? (res.find((r) => !r.danger) || res[0]).score : 0;
    return res.filter((r) => r.danger || r.score >= top * 0.22).slice(0, limit);
  }

  /** Plug in another ranker (e.g. a downloaded meaning model): { weight (0..1), rank(query, lang) → [{ id, score 0..1 }] (may be async) }. */
  function addRanker(r) { rankers.push(r); }
  /** rank() blended with the plugged-in rankers. Danger pages found by the word list always stay first. */
  async function rankAsync(query, lang = 'fa', { limit = 5 } = {}) {
    const lex = rank(query, lang, { limit: 50 });
    if (!rankers.length) return lex.slice(0, limit);
    const scale = Math.max(4, ...lex.map((r) => r.score));
    const by = new Map(lex.map((r) => [r.id, { ...r }]));
    for (const rk of rankers) {
      let out = []; try { out = (await rk.rank(query, lang)) || []; } catch { out = []; }
      for (const { id, score } of out) {
        if (!exists(id)) continue;
        const p = pageOf(id); const r = by.get(p) || { id: p, target: id !== p ? id : null, route: routeOf(id), score: 0, danger: false };
        r.score += (rk.weight == null ? 0.5 : rk.weight) * Math.max(0, Math.min(1, score)) * scale; by.set(p, r);
      }
    }
    return order([...by.values()], limit);
  }

  /** Make the index for a language now (it is otherwise made on the first search). */
  function warm(lang = 'fa') {
    idx(lang);
    // a few throwaway searches so the first real letters are not slowed by the JavaScript engine warming up
    for (const q of ['بچه تب دارد', 'ماشوم ټوخی کوي', 'سرف', 'child fever', 'nafas nemikasha']) rank(q, lang);
  }

  return { rank, rankAsync, addRanker, warm, exists, routeOf, tokenize, normalize };
}
