/* Progress state. Everything lives in localStorage under one key.
   No network, no accounts — see export()/import() for moving it between devices. */

import { VOCAB } from "../data/vocab.js";

const KEY = "chineselab.v1";
const DAY = 86400000;

export const DAILY_GOAL = { vocab: 10, listening: 5, characters: 5, grammar: 1 };

export const LEVELS = [
  { xp: 0, name: "Beginner", hanzi: "初学" },
  { xp: 120, name: "Explorer", hanzi: "探索" },
  { xp: 350, name: "Learner", hanzi: "学徒" },
  { xp: 700, name: "Conversation starter", hanzi: "会话" },
  { xp: 1200, name: "Character collector", hanzi: "识字" },
  { xp: 2000, name: "Tone reader", hanzi: "听音" },
  { xp: 3200, name: "Steady reader", hanzi: "读者" },
  { xp: 5000, name: "HSK navigator", hanzi: "领航" },
  { xp: 7500, name: "Fluent path", hanzi: "流利" }
];

export const ACHIEVEMENTS = [
  { id: "first10", icon: "十", title: "First 10 words", desc: "Studied 10 different words", test: (s) => countStudied(s) >= 10 },
  { id: "streak3", icon: "三", title: "3 day streak", desc: "Practised three days in a row", test: (s) => s.streak.longest >= 3 },
  { id: "streak7", icon: "七", title: "7 day streak", desc: "A full week of practice", test: (s) => s.streak.longest >= 7 },
  { id: "words100", icon: "百", title: "100 words", desc: "Studied 100 different words", test: (s) => countStudied(s) >= 100 },
  { id: "listen50", icon: "听", title: "50 listening answers", desc: "Answered 50 listening questions", test: (s) => s.skills.listening.t >= 50 },
  { id: "write50", icon: "写", title: "50 characters written", desc: "Practised writing 50 characters", test: (s) => s.stats.charsPracticed >= 50 },
  { id: "perfect10", icon: "满", title: "10 perfect sessions", desc: "Finished 10 sessions without a mistake", test: (s) => s.stats.perfect >= 10 },
  { id: "hsk1", icon: "一", title: "HSK 1 complete", desc: "Every HSK 1 word reached mastery", test: (s) => levelMastered(s, 1) },
  { id: "hsk2", icon: "二", title: "HSK 2 complete", desc: "Every HSK 2 word reached mastery", test: (s) => levelMastered(s, 2) },
  { id: "hsk3", icon: "三", title: "HSK 3 complete", desc: "Every HSK 3 word reached mastery", test: (s) => levelMastered(s, 3) },
  { id: "hsk4", icon: "四", title: "HSK 4 complete", desc: "Every HSK 4 word reached mastery", test: (s) => levelMastered(s, 4) }
];

const SKILL_KEYS = ["vocab", "pinyin", "listening", "tone", "grammar", "sentence"];

function blank() {
  const skills = {};
  SKILL_KEYS.forEach((k) => (skills[k] = { c: 0, t: 0 }));
  return {
    v: 1,
    created: Date.now(),
    xp: 0,
    streak: { current: 0, longest: 0, last: null, days: {} },
    daily: null,
    cards: {},
    skills,
    stats: { answered: 0, correct: 0, charsPracticed: 0, studyMs: 0, sessions: 0, perfect: 0 },
    achievements: {},
    settings: { theme: "auto", meaning: "en", rate: 0.85, voice: "" }
  };
}

function migrate(raw) {
  const base = blank();
  if (!raw || typeof raw !== "object") return base;
  const s = { ...base, ...raw };
  s.streak = { ...base.streak, ...(raw.streak || {}) };
  s.streak.days = raw.streak?.days || {};
  s.stats = { ...base.stats, ...(raw.stats || {}) };
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  s.skills = { ...base.skills };
  SKILL_KEYS.forEach((k) => { if (raw.skills?.[k]) s.skills[k] = { c: 0, t: 0, ...raw.skills[k] }; });
  s.cards = raw.cards && typeof raw.cards === "object" ? raw.cards : {};
  s.achievements = raw.achievements && typeof raw.achievements === "object" ? raw.achievements : {};
  return s;
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return migrate(raw ? JSON.parse(raw) : null);
  } catch {
    return blank();
  }
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn("Could not save progress:", e); }
  }, 120);
}

export function get() { return state; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(detail = {}) { listeners.forEach((fn) => fn(state, detail)); }

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
  emit({ settings: true });
}

/* ---------- dates ---------- */

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function freshDaily() {
  return { date: todayKey(), xp: 0, vocab: 0, listening: 0, characters: 0, grammar: 0, claimed: false, done: { words: 0, questions: 0, listening: 0 } };
}

export function daily() {
  if (!state.daily || state.daily.date !== todayKey()) {
    state.daily = freshDaily();
    save();
  }
  return state.daily;
}

/** Called before any scoring activity: rolls the day over and keeps the streak honest. */
export function touchDay() {
  const t = todayKey();
  daily();
  if (state.streak.last === t) return;
  const y = todayKey(new Date(Date.now() - DAY));
  state.streak.current = state.streak.last === y ? state.streak.current + 1 : 1;
  state.streak.last = t;
  state.streak.longest = Math.max(state.streak.longest, state.streak.current);
  save();
}

/** True when the streak is still alive but today has no activity yet. */
export function streakAtRisk() {
  const t = todayKey();
  return state.streak.current > 0 && state.streak.last !== t;
}

export function streakDisplay() {
  const t = todayKey();
  const y = todayKey(new Date(Date.now() - DAY));
  if (state.streak.last === t || state.streak.last === y) return state.streak.current;
  return 0;
}

/* ---------- xp & levels ---------- */

export function addXP(amount, reason = "") {
  touchDay();
  state.xp += amount;
  const d = daily();
  d.xp += amount;
  state.streak.days[todayKey()] = (state.streak.days[todayKey()] || 0) + amount;
  save();
  const unlocked = checkAchievements();
  emit({ xp: amount, reason, unlocked });
  return amount;
}

export function levelInfo(xp = state.xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1] || null;
  const span = next ? next.xp - cur.xp : 1;
  return {
    index: i + 1, name: cur.name, hanzi: cur.hanzi, next,
    into: xp - cur.xp, span,
    pct: next ? Math.min(100, ((xp - cur.xp) / span) * 100) : 100
  };
}

/* ---------- skills ---------- */

export function recordAnswer(skill, correct) {
  touchDay();
  const s = state.skills[skill] || (state.skills[skill] = { c: 0, t: 0 });
  s.t++;
  if (correct) s.c++;
  state.stats.answered++;
  if (correct) state.stats.correct++;
  const d = daily();
  if (skill === "listening") { d.listening++; d.done.listening++; }
  if (skill === "grammar") d.grammar++;
  d.done.questions++;
  save();
}

export function recordCharacterPractice(n = 1) {
  touchDay();
  state.stats.charsPracticed += n;
  daily().characters += n;
  save();
  const unlocked = checkAchievements();
  emit({ unlocked });
}

export function addStudyTime(ms) {
  state.stats.studyMs += ms;
  save();
}

export function finishSession(perfect) {
  state.stats.sessions++;
  if (perfect) state.stats.perfect++;
  save();
}

export function skillPct(skill) {
  const s = state.skills[skill];
  if (!s || !s.t) return 0;
  return Math.round((s.c / s.t) * 100);
}

/* ---------- spaced repetition ---------- */

const MIN_EF = 1.6, MAX_EF = 2.8;

export function card(id) { return state.cards[id] || null; }

export function isNew(id) { return !state.cards[id]; }

export function countStudied(s = state) { return Object.keys(s.cards).length; }

export function mastery(id) {
  const c = state.cards[id];
  if (!c) return 0;
  return Math.max(0, Math.min(100, Math.round(c.n * 22 - c.wrong * 4)));
}

export function levelStats(level) {
  const words = VOCAB.filter((w) => w.level === level);
  let started = 0, mastered = 0, sum = 0;
  for (const w of words) {
    const m = mastery(w.id);
    if (state.cards[w.id]) started++;
    if (m >= 80) mastered++;
    sum += m;
  }
  return {
    total: words.length, started, mastered,
    pct: words.length ? Math.round(sum / words.length) : 0
  };
}

function levelMastered(s, level) {
  const words = VOCAB.filter((w) => w.level === level);
  return words.length > 0 && words.every((w) => {
    const c = s.cards[w.id];
    return c && Math.min(100, c.n * 22 - c.wrong * 4) >= 80;
  });
}

/** grade: "good" | "again". Returns the updated card. */
export function grade(id, good) {
  touchDay();
  const now = Date.now();
  let c = state.cards[id];
  const first = !c;
  if (!c) c = state.cards[id] = { n: 0, ef: 2.5, iv: 0, due: now, seen: 0, correct: 0, wrong: 0, last: 0 };
  c.seen++;
  c.last = now;
  if (good) {
    c.correct++;
    c.n++;
    c.ef = Math.min(MAX_EF, c.ef + 0.05);
    c.iv = c.n === 1 ? 1 : c.n === 2 ? 3 : Math.round(c.iv * c.ef);
    c.due = now + c.iv * DAY;
  } else {
    c.wrong++;
    c.n = 0;
    c.ef = Math.max(MIN_EF, c.ef - 0.2);
    c.iv = 0;
    c.due = now + 6e4; // back within this session
  }
  const d = daily();
  if (first) { d.vocab++; d.done.words++; }
  save();
  const unlocked = checkAchievements();
  emit({ unlocked });
  return { card: c, first };
}

export function dueCards(level = 0, limit = Infinity) {
  const now = Date.now();
  return VOCAB
    .filter((w) => (!level || w.level === level) && state.cards[w.id] && state.cards[w.id].due <= now)
    .sort((a, b) => state.cards[a.id].due - state.cards[b.id].due)
    .slice(0, limit);
}

export function newWords(level = 0, limit = Infinity) {
  return VOCAB.filter((w) => (!level || w.level === level) && !state.cards[w.id]).slice(0, limit);
}

/** Weighted pool for quiz-type exercises: struggling words first, mixed with fresh ones. */
export function studyPool(level = 0, limit = 40) {
  const now = Date.now();
  const scored = VOCAB
    .filter((w) => !level || w.level === level)
    .map((w) => {
      const c = state.cards[w.id];
      if (!c) return { w, score: 40 };
      const overdue = Math.max(0, (now - c.due) / DAY);
      return { w, score: 30 + overdue * 12 + c.wrong * 18 - c.n * 6 };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.w);
}

/* ---------- daily challenge ---------- */

function seedFor(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/** Deterministic for the calendar day — refreshing never rerolls it. */
export function challenge() {
  const key = todayKey();
  const seed = seedFor(key);
  const focus = (seed % 3) + 1;
  const words = 4 + (seed % 3);
  const questions = 3 + ((seed >> 3) % 3);
  const listening = 1 + ((seed >> 6) % 2);
  const d = daily();
  const done = d.done;
  const tasks = [
    { key: "words", label: `Study ${words} words`, need: words, have: Math.min(done.words, words) },
    { key: "questions", label: `Answer ${questions} questions`, need: questions, have: Math.min(done.questions, questions) },
    { key: "listening", label: `Finish ${listening} listening question${listening > 1 ? "s" : ""}`, need: listening, have: Math.min(done.listening, listening) }
  ];
  const complete = tasks.every((t) => t.have >= t.need);
  return { date: key, focus, tasks, complete, claimed: d.claimed, reward: 25 };
}

export function claimChallenge() {
  const c = challenge();
  const d = daily();
  if (!c.complete || d.claimed) return false;
  d.claimed = true;
  addXP(c.reward, "challenge");
  return true;
}

/* ---------- achievements ---------- */

export function checkAchievements() {
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.test(state); } catch { ok = false; }
    if (ok) { state.achievements[a.id] = Date.now(); unlocked.push(a); }
  }
  if (unlocked.length) save();
  return unlocked;
}

/* ---------- export / import / reset ---------- */

export function exportJSON() {
  return JSON.stringify({ app: "chinese-lab", exported: new Date().toISOString(), state }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const incoming = parsed.state || parsed;
  if (!incoming || typeof incoming !== "object" || !("cards" in incoming)) {
    throw new Error("This file doesn't look like a Chinese Lab backup.");
  }
  state = migrate(incoming);
  save();
  emit({ imported: true });
  return true;
}

export function reset() {
  state = blank();
  try { localStorage.removeItem(KEY); } catch {}
  save();
  emit({ reset: true });
}
