/* Vocabulary index.
   Raw rows live in hsk1.js … hsk4.js and are expanded here into objects:

   { id, level, hanzi, pinyin, meaning, meaningDe, example, examplePinyin,
     exampleTranslation, category, chars[] }

   Nothing in the UI touches the raw arrays — always import from here. */

import hsk1 from "./hsk1.js";
import hsk2 from "./hsk2.js";
import hsk3 from "./hsk3.js";
import hsk4 from "./hsk4.js";

const pad = (n) => String(n).padStart(3, "0");

function expand(rows, level) {
  return rows.map((r, i) => ({
    id: `hsk${level}-${pad(i + 1)}`,
    level,
    hanzi: r[0],
    pinyin: r[1],
    meaning: r[2],
    meaningDe: r[3],
    category: r[4],
    example: r[5],
    examplePinyin: r[6],
    exampleTranslation: r[7],
    chars: [...r[0]].filter((c) => /[\u4e00-\u9fff]/.test(c))
  }));
}

export const VOCAB = [
  ...expand(hsk1, 1),
  ...expand(hsk2, 2),
  ...expand(hsk3, 3),
  ...expand(hsk4, 4)
];

export const BY_ID = Object.fromEntries(VOCAB.map((w) => [w.id, w]));

export const LEVELS = [1, 2, 3, 4].map((n) => ({
  level: n,
  label: `HSK ${n}`,
  hanzi: ["一", "二", "三", "四"][n - 1],
  count: VOCAB.filter((w) => w.level === n).length
}));

export const CATEGORY_LABELS = {
  greetings: ["Greetings", "问候"],
  people: ["People", "人物"],
  family: ["Family", "家人"],
  food: ["Food & drink", "饮食"],
  time: ["Time", "时间"],
  numbers: ["Numbers", "数字"],
  travel: ["Travel", "出行"],
  school: ["School", "学习"],
  work: ["Work", "工作"],
  daily: ["Daily life", "生活"],
  feelings: ["Feelings", "感受"],
  places: ["Places", "地点"],
  actions: ["Actions", "动作"],
  adjectives: ["Descriptions", "形容"],
  things: ["Things", "物品"],
  questions: ["Questions", "疑问"],
  grammar: ["Grammar words", "语法"],
  health: ["Body & health", "身体"],
  money: ["Money", "钱"],
  nature: ["Nature & weather", "自然"],
  society: ["Society", "社会"],
  communication: ["Talking & media", "交流"],
  abstract: ["Ideas & abstractions", "抽象"]
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS)
  .map((key) => ({
    key,
    label: CATEGORY_LABELS[key][0],
    hanzi: CATEGORY_LABELS[key][1],
    count: VOCAB.filter((w) => w.category === key).length
  }))
  .filter((c) => c.count > 0);

/* ---------- pinyin helpers ---------- */

const TONE_CHARS = {
  ā: ["a", 1], á: ["a", 2], ǎ: ["a", 3], à: ["a", 4],
  ē: ["e", 1], é: ["e", 2], ě: ["e", 3], è: ["e", 4],
  ī: ["i", 1], í: ["i", 2], ǐ: ["i", 3], ì: ["i", 4],
  ō: ["o", 1], ó: ["o", 2], ǒ: ["o", 3], ò: ["o", 4],
  ū: ["u", 1], ú: ["u", 2], ǔ: ["u", 3], ù: ["u", 4],
  ǖ: ["ü", 1], ǘ: ["ü", 2], ǚ: ["ü", 3], ǜ: ["ü", 4]
};

const MARKED = {
  a: ["ā", "á", "ǎ", "à"], e: ["ē", "é", "ě", "è"], i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"], u: ["ū", "ú", "ǔ", "ù"], ü: ["ǖ", "ǘ", "ǚ", "ǜ"]
};

/** "nǐ hǎo" -> "ni hao" */
export function stripTones(pinyin) {
  return [...pinyin].map((ch) => (TONE_CHARS[ch] ? TONE_CHARS[ch][0] : ch)).join("");
}

/** Tone number of a single syllable, 5 = neutral. */
export function toneOf(syllable) {
  for (const ch of syllable) if (TONE_CHARS[ch]) return TONE_CHARS[ch][1];
  return 5;
}

/** Put tone `n` (1-4, or 5 for none) on a toneless syllable. */
export function applyTone(syllable, n) {
  const plain = stripTones(syllable);
  if (n === 5) return plain;
  const lower = plain.toLowerCase();
  let idx = -1;
  if (lower.includes("a")) idx = lower.indexOf("a");
  else if (lower.includes("e")) idx = lower.indexOf("e");
  else if (lower.includes("ou")) idx = lower.indexOf("o");
  else {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ("aeiouü".includes(lower[i])) { idx = i; break; }
    }
  }
  if (idx < 0) return plain;
  const v = lower[idx];
  const marked = MARKED[v] ? MARKED[v][n - 1] : v;
  return plain.slice(0, idx) + marked + plain.slice(idx + 1);
}

export function syllables(pinyin) {
  return pinyin.split(/\s+/).filter(Boolean);
}

/** Search across hanzi, pinyin (with or without tones) and both meanings. */
export function searchVocab(query, { level = 0 } = {}) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const qPlain = stripTones(q);
  return VOCAB.filter((w) => {
    if (level && w.level !== level) return false;
    if (w.hanzi.includes(q)) return true;
    const py = w.pinyin.toLowerCase();
    if (py.includes(q) || stripTones(py).includes(qPlain)) return true;
    if (stripTones(py).replace(/\s/g, "").includes(qPlain.replace(/\s/g, ""))) return true;
    if (w.meaning.toLowerCase().includes(q)) return true;
    if (w.meaningDe.toLowerCase().includes(q)) return true;
    return false;
  }).slice(0, 60);
}

/** Every distinct character in the deck, most common first. */
export function characterDeck(level = 0) {
  const seen = new Map();
  for (const w of VOCAB) {
    if (level && w.level !== level) continue;
    for (const c of w.chars) {
      if (!seen.has(c)) seen.set(c, { char: c, words: [], level: w.level });
      seen.get(c).words.push(w);
    }
  }
  return [...seen.values()];
}
