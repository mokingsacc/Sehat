// The skills graph on the phone (P25a, C4.1): the reviewed graphs that came with the packs (hub.graphs(), content
// only), and what code works out from them. Nothing here is sent.
// - A node maps to lessons (`nodes[].lessons`); a lesson in no node plans as P22 did, in pack order.
// - Mastered: her latest sheet for the lesson at 80% or more (P20's rule), or, for a lesson without a sheet, finished.
//   Nothing else.
// - A plan over the graph: the `needs` of the goal's nodes, prerequisites first, less what she has mastered (each
//   such lesson tagged "Learn first"), then the goal's own lessons in pack order; twelve at most.
// - A pathway is a named goal that runs as a plan (its `path` id kept in the plan).
// `mine` is always her own lessons in pack order (plan.js bandLessons): adults' from adult packs, children's by band.

import * as hub from './hub.js';
import { pick } from './i18n.js';

export const MAX = 12;
export const MASTERED = 80;

export const all = () => hub.graphs().filter((g) => g && Array.isArray(g.nodes));

// the node a lesson belongs to, with its graph, or null
export function nodeOf(lessonId) {
  for (const g of all()) for (const n of g.nodes) if ((n.lessons || []).includes(lessonId)) return { g, n };
  return null;
}

export function mastered(c, lesson) {
  if (!c || !lesson) return false;
  if (lesson.sheet) return Number.isFinite((c.marks || {})[lesson.id]) && c.marks[lesson.id] >= MASTERED;
  return !!(c.done && c.done[lesson.id]);
}

// every node the goal nodes need, deepest first, then the goal nodes themselves (each once)
function closure(g, goal) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const seen = new Set();
  const out = [];
  const visit = (n) => {
    if (!n || seen.has(n.id)) return;
    seen.add(n.id);
    for (const m of n.needs || []) visit(byId.get(m));
    out.push(n);
  };
  goal.forEach((id) => visit(byId.get(id)));
  return out;
}

// her lessons of these nodes, node by node in the order given, each node's in pack order
const lessonsOf = (nodes, mine) => {
  const at = new Map(mine.map((l, i) => [l.id, i]));
  return nodes.flatMap((n) => (n.lessons || []).filter((id) => at.has(id)).sort((a, b) => at.get(a) - at.get(b))
    .map((id) => mine[at.get(id)]));
};

// a plan for these goal lessons (a search's answer): { lessons: ids, first: Set of the "Learn first" ids }
export function expand(c, ids, mine) {
  const goals = [];
  for (const id of ids) {
    const at = nodeOf(id);
    if (at && !goals.some((x) => x.n.id === at.n.id)) goals.push(at);
  }
  const first = [];
  for (const { g, n } of goals) {
    const goalIds = new Set(goals.filter((x) => x.g === g).map((x) => x.n.id));
    const needed = closure(g, [n.id]).filter((x) => !goalIds.has(x.id));
    for (const l of lessonsOf(needed, mine)) if (!mastered(c, l) && !ids.includes(l.id) && !first.includes(l.id)) first.push(l.id);
  }
  const lessons = [...new Set([...first, ...ids])].slice(0, MAX);
  return { lessons, first: new Set(first.filter((id) => lessons.includes(id))) };
}

// the pathways for her band (in one subject, or all), each { g, p }, with at least one lesson of hers in its goal
export function pathways(c, mine, subject = null) {
  const out = [];
  for (const g of all()) {
    if (subject && g.subject !== subject) continue;
    for (const p of g.pathways || []) {
      if (!(p.bands || []).includes(c.band)) continue;
      if (lessonsOf(closure(g, p.goal || []).filter((n) => (p.goal || []).includes(n.id)), mine).length) out.push({ g, p });
    }
  }
  return out;
}

// a pathway as a plan: what its goal needs that she has not mastered (Learn first), then the goal's lessons
export function pathwayPlan(c, { g, p }, mine) {
  const goal = new Set(p.goal || []);
  const nodes = closure(g, p.goal || []);
  const first = lessonsOf(nodes.filter((n) => !goal.has(n.id)), mine).filter((l) => !mastered(c, l)).map((l) => l.id);
  const own = lessonsOf(nodes.filter((n) => goal.has(n.id)), mine).map((l) => l.id);
  const lessons = [...new Set([...first, ...own])].slice(0, MAX);
  return { label: pick(p.title), lessons, first: new Set(first.filter((id) => lessons.includes(id))), path: p.id,
    certificate: !!p.certificate, final: p.final || null };
}

export function findPathway(id) {
  for (const g of all()) for (const p of g.pathways || []) if (p.id === id) return { g, p };
  return null;
}

// her goal against the nodes' titles (every language): the node holding half her words or more, with her lessons
// of it, or null. `words` and `same` are plan.js's, so the phone matches as P22's search does.
export function matchNode(text, mine, words, same) {
  const want = [...new Set(words(text))];
  if (!want.length) return null;
  let best = null;
  let share = 0;
  for (const g of all()) {
    for (const n of g.nodes) {
      const ls = lessonsOf([n], mine);
      if (!ls.length) continue;
      const have = words(['prs', 'ps', 'en'].map((x) => pick(n.title, x)).join(' '));
      const s = want.filter((w) => have.some((x) => same(w, x))).length / want.length;
      if (s >= 0.5 && s > share) { best = { n, lessons: ls.map((l) => l.id) }; share = s; }
    }
  }
  return best;
}
