/* Exercise generation + the session runner.
   A session is just an array of item objects; every item knows how to render
   itself and reports back through ctx.answer(correct). */

import { VOCAB, toneOf, applyTone, syllables, stripTones } from "../data/vocab.js";
import { GRAMMAR, SENTENCES, TONE_SETS } from "../data/grammar.js";
import { CLOZE, RULES } from "../data/rules.js";
import * as S from "./state.js";
import { speak, ttsAvailable, TTS_UNAVAILABLE } from "./audio.js";
import { h, clear, shuffle, sample, pick, speaker, bar, toast, xpBurst, achievementPopup, meaningOf, reducedMotion, countUp } from "./ui.js";

const XP_CORRECT = 5;
const XP_NEW_WORD = 10;
const XP_PERFECT = 15;

/* ------------------------------------------------------------------ */
/* item builders                                                       */
/* ------------------------------------------------------------------ */

function otherWords(word, n, level) {
  const pool = VOCAB.filter((w) => w.id !== word.id && (!level || Math.abs(w.level - word.level) <= 1));
  const seen = new Set([meaningOf(word)]);
  const out = [];
  for (const w of shuffle(pool)) {
    const m = meaningOf(w);
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(w);
    if (out.length === n) break;
  }
  return out;
}

export function flashItem(word) {
  return { type: "flash", skill: "vocab", word };
}

export function choiceItem(word, reverse = false) {
  const others = otherWords(word, 3);
  const options = shuffle([word, ...others]);
  return {
    type: "choice", skill: "vocab", word, reverse,
    options, answer: options.indexOf(word)
  };
}

export function pinyinItem(word, reverse = false) {
  if (reverse) {
    const others = otherWords(word, 3);
    const options = shuffle([word, ...others]);
    return { type: "pinyin", skill: "pinyin", word, reverse: true, options, answer: options.indexOf(word) };
  }
  const correct = word.pinyin;
  const set = new Set([correct]);
  const syls = syllables(correct);
  let guard = 0;
  while (set.size < 4 && guard++ < 60) {
    const i = Math.floor(Math.random() * syls.length);
    const t = 1 + Math.floor(Math.random() * 4);
    const copy = [...syls];
    copy[i] = applyTone(copy[i], t);
    const variant = copy.join(" ");
    if (variant !== correct) set.add(variant);
  }
  while (set.size < 4) {
    const w = pick(VOCAB.filter((x) => x.pinyin !== correct));
    set.add(w.pinyin);
  }
  const options = shuffle([...set]);
  return { type: "pinyin", skill: "pinyin", word, reverse: false, options, answer: options.indexOf(correct) };
}

export function toneItem(word) {
  // Two flavours: a classic minimal pair, or the first syllable of a real word.
  if (Math.random() < 0.5) {
    const set = pick(TONE_SETS);
    const item = pick(set.items);
    return { type: "tone", skill: "tone", syllable: item[0], tone: item[1], hanzi: item[2], gloss: item[3], set };
  }
  const syl = syllables(word.pinyin)[0];
  return { type: "tone", skill: "tone", syllable: syl, tone: toneOf(syl), hanzi: word.hanzi[0], gloss: meaningOf(word), word };
}

export function listenItem(word) {
  const target = word.example ? { text: word.example, pinyin: word.examplePinyin, en: word.exampleTranslation } : null;
  if (!target) return choiceItem(word);
  const pool = VOCAB.filter((w) => w.id !== word.id && w.example && Math.abs(w.example.length - word.example.length) <= 3);
  const distractors = sample(pool.length >= 3 ? pool : VOCAB.filter((w) => w.id !== word.id && w.example), 3)
    .map((w) => ({ text: w.example, pinyin: w.examplePinyin, en: w.exampleTranslation }));
  const options = shuffle([target, ...distractors]);
  return { type: "listen", skill: "listening", word, target, options, answer: options.indexOf(target) };
}

export function sentenceItem(sentence) {
  return { type: "sentence", skill: "sentence", sentence };
}

export function grammarItem(point) {
  return { type: "grammar", skill: "grammar", point };
}

export function clozeItem(entry) {
  return { type: "cloze", skill: "grammar", entry };
}

export function ruleItem(rule) {
  return { type: "rule", skill: "grammar", rule };
}

/* ------------------------------------------------------------------ */
/* session builders                                                    */
/* ------------------------------------------------------------------ */

function vocabQueue(level, n) {
  const due = S.dueCards(level, n);
  const rest = n - due.length;
  const fresh = rest > 0 ? S.newWords(level, rest) : [];
  const filler = due.length + fresh.length < n ? S.studyPool(level, n) : [];
  const seen = new Set();
  return [...due, ...fresh, ...filler].filter((w) => (seen.has(w.id) ? false : seen.add(w.id))).slice(0, n);
}

export function buildQuickSession(level) {
  const words = vocabQueue(level, 8);
  const items = [];
  words.slice(0, 5).forEach((w, i) => items.push(S.isNew(w.id) || i % 2 === 0 ? flashItem(w) : choiceItem(w)));
  const listenPool = words.filter((w) => w.example);
  if (ttsAvailable()) listenPool.slice(0, 3).forEach((w) => items.push(listenItem(w)));
  else words.slice(0, 3).forEach((w) => items.push(pinyinItem(w)));
  const points = GRAMMAR.filter((g) => g.level === level);
  sample(points, 2).forEach((p) => items.push(grammarItem(p)));
  const gaps = CLOZE.filter((c) => c.level === level);
  sample(gaps, Math.min(2, gaps.length)).forEach((c) => items.push(clozeItem(c)));
  return { title: "Daily session", subtitle: `HSK ${level}`, items: items.filter(Boolean) };
}

export function buildModeSession(mode, level, count = 10) {
  const words = vocabQueue(level, count);
  switch (mode) {
    case "flash":
      return { title: "Vocabulary", subtitle: `HSK ${level}`, items: words.map(flashItem) };
    case "choice":
      return { title: "Multiple choice", subtitle: `HSK ${level}`, items: words.map((w, i) => choiceItem(w, i % 3 === 2)) };
    case "listen":
      return { title: "Listening", subtitle: `HSK ${level}`, items: words.filter((w) => w.example).map(listenItem) };
    case "pinyin":
      return { title: "Pinyin", subtitle: `HSK ${level}`, items: words.map((w, i) => pinyinItem(w, i % 4 === 3)) };
    case "tone":
      return { title: "Tones", subtitle: `HSK ${level}`, items: words.map(toneItem) };
    case "sentence": {
      const pool = SENTENCES.filter((s) => s.level === level);
      return { title: "Sentence building", subtitle: `HSK ${level}`, items: sample(pool, Math.min(6, pool.length)).map(sentenceItem) };
    }
    case "grammar": {
      const pool = GRAMMAR.filter((g) => g.level === level);
      return { title: "Grammar", subtitle: `HSK ${level}`, items: sample(pool, Math.min(6, pool.length)).map(grammarItem) };
    }
    case "cloze": {
      const pool = CLOZE.filter((c) => c.level === level);
      return { title: "Fill the gap", subtitle: `HSK ${level}`, items: sample(pool, Math.min(8, pool.length)).map(clozeItem) };
    }
    case "rules": {
      const pool = RULES.filter((r) => r.level === level && r.check);
      return { title: "Rule check", subtitle: `HSK ${level}`, items: sample(pool, Math.min(6, pool.length)).map(ruleItem) };
    }
    default:
      return buildQuickSession(level);
  }
}

export function buildReviewSession(level, limit = 15) {
  const due = S.dueCards(level, limit);
  const items = due.map((w, i) => (i % 2 === 0 ? flashItem(w) : choiceItem(w)));
  return { title: "Review", subtitle: due.length ? `${due.length} due` : "Nothing due", items };
}

export function buildWordSession(word) {
  return { title: "Single word", subtitle: word.hanzi, items: [flashItem(word), choiceItem(word), pinyinItem(word)] };
}

export function buildGrammarSession(point) {
  return { title: point.title, subtitle: `HSK ${point.level}`, items: [grammarItem(point)] };
}

export function buildRuleSession(rule) {
  const gaps = CLOZE.filter((c) => c.level === rule.level);
  const extra = sample(gaps, Math.min(2, gaps.length)).map(clozeItem);
  return { title: rule.title, subtitle: `HSK ${rule.level}`, items: [ruleItem(rule), ...extra] };
}

export function buildClozeSession(level, count = 8) {
  const pool = CLOZE.filter((c) => c.level === level);
  return { title: "Fill the gap", subtitle: `HSK ${level}`, items: sample(pool, Math.min(count, pool.length)).map(clozeItem) };
}

/* ------------------------------------------------------------------ */
/* runner                                                              */
/* ------------------------------------------------------------------ */

export function runSession(session, host, { onExit } = {}) {
  clear(host);
  const items = session.items.filter(Boolean);
  if (!items.length) {
    host.append(h("div", { class: "empty-state" },
      h("p", { class: "empty-hanzi", "aria-hidden": "true" }, "空"),
      h("h2", {}, "Nothing to practise here yet"),
      h("p", {}, "Pick another mode or add a level to your queue."),
      h("button", { class: "btn", onclick: () => onExit?.() }, "Back")
    ));
    return;
  }

  const started = Date.now();
  let index = 0, correctCount = 0, xpTotal = 0;
  const missed = [];

  const progressFill = h("i", { class: "bar-fill" });
  const xpNode = h("strong", { class: "run-xp-val" }, "0");
  const stage = h("div", { class: "run-stage" });
  const feedback = h("div", { class: "run-feedback", hidden: true });

  const head = h("header", { class: "run-head" },
    h("button", { class: "run-close", type: "button", "aria-label": "Leave session", onclick: leave }, "✕"),
    h("div", { class: "bar run-bar", role: "progressbar", "aria-label": "Session progress", "aria-valuemin": "0", "aria-valuemax": String(items.length), "aria-valuenow": "0" }, progressFill),
    h("p", { class: "run-xp" }, xpNode, h("span", {}, " XP"))
  );

  host.append(h("section", { class: "runner" }, head, stage, feedback));

  function leave() {
    S.addStudyTime(Date.now() - started);
    onExit?.();
  }

  function setProgress() {
    progressFill.style.width = (index / items.length) * 100 + "%";
    head.querySelector(".run-bar").setAttribute("aria-valuenow", String(index));
  }

  function award(n, anchor) {
    xpTotal += n;
    const from = Number(xpNode.textContent) || 0;
    countUp(xpNode, from, xpTotal, 500);
    xpBurst(n, anchor);
  }

  const ctx = {
    /** Called by every exercise when the learner responds. */
    answer(correct, { anchor, word, grade = true, detail } = {}) {
      const item = items[index];
      S.recordAnswer(item.skill, correct);
      let earned = 0;
      if (word && grade) {
        const first = S.isNew(word.id);
        const res = S.grade(word.id, correct);
        if (correct) earned += first && res.first ? XP_NEW_WORD : XP_CORRECT;
      } else if (correct) {
        earned += XP_CORRECT;
      }
      if (correct) { correctCount++; if (earned) { S.addXP(earned, "answer"); award(earned, anchor); } }
      else missed.push(item);
      stage.classList.toggle("shake", !correct && !reducedMotion());
      setTimeout(() => stage.classList.remove("shake"), 500);
      showFeedback(correct, detail);
    },
    /** Flashcards report knowledge without a right/wrong quiz frame. */
    selfReport(knew, word, anchor) {
      const first = S.isNew(word.id);
      const res = S.grade(word.id, knew);
      S.recordAnswer("vocab", knew);
      if (knew) {
        correctCount++;
        const earned = first && res.first ? XP_NEW_WORD : XP_CORRECT;
        S.addXP(earned, "flash");
        award(earned, anchor);
      } else {
        missed.push(items[index]);
      }
      next();
    },
    next
  };

  function showFeedback(correct, detail) {
    feedback.hidden = false;
    clear(feedback);
    feedback.className = `run-feedback ${correct ? "ok" : "no"}`;
    const cont = h("button", { class: "btn btn-primary", onclick: next }, index + 1 >= items.length ? "See results" : "Continue");
    feedback.append(
      h("div", { class: "run-verdict" },
        h("span", { class: "verdict-mark", "aria-hidden": "true" }, correct ? "✓" : "✕"),
        h("span", {}, correct ? "Correct" : "Not quite")
      ),
      detail || "",
      cont
    );
    cont.focus({ preventScroll: true });
    feedback.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }

  function next() {
    feedback.hidden = true;
    clear(feedback);
    index++;
    setProgress();
    if (index >= items.length) return finish();
    render();
  }

  function render() {
    clear(stage);
    const item = items[index];
    stage.append(renderItem(item, ctx));
    const first = stage.querySelector("[data-autofocus]");
    if (first) first.focus({ preventScroll: true });
  }

  function finish() {
    const perfect = missed.length === 0;
    if (perfect && items.length >= 4) {
      S.addXP(XP_PERFECT, "perfect");
      xpTotal += XP_PERFECT;
    }
    S.finishSession(perfect);
    S.addStudyTime(Date.now() - started);
    const unlocked = S.checkAchievements();
    clear(host);
    host.append(summary({
      session, total: items.length, correct: correctCount, xp: xpTotal, perfect, missed,
      onRetry: () => runSession({ ...session, items: missed.map(reshuffleItem) }, host, { onExit }),
      onExit: () => onExit?.()
    }));
    if (unlocked.length) setTimeout(() => achievementPopup(unlocked), 500);
  }

  setProgress();
  render();
}

function reshuffleItem(item) {
  if (item.type === "choice") return choiceItem(item.word, item.reverse);
  if (item.type === "pinyin") return pinyinItem(item.word, item.reverse);
  if (item.type === "listen") return listenItem(item.word);
  return item;
}

function summary({ session, total, correct, xp, perfect, missed, onRetry, onExit }) {
  const pct = Math.round((correct / total) * 100);
  const streak = S.streakDisplay();
  return h("section", { class: "summary" },
    h("p", { class: "summary-hanzi", "aria-hidden": "true" }, perfect ? "满分" : "完成"),
    h("h2", {}, perfect ? "Perfect session" : "Session complete"),
    h("p", { class: "summary-sub" }, `${correct} of ${total} correct · ${pct}%`),
    h("div", { class: "summary-grid" },
      h("div", { class: "summary-stat" }, h("strong", {}, `+${xp}`), h("span", {}, "XP earned")),
      h("div", { class: "summary-stat" }, h("strong", {}, streak), h("span", {}, streak === 1 ? "day streak" : "day streak")),
      h("div", { class: "summary-stat" }, h("strong", {}, missed.length), h("span", {}, "to revisit"))
    ),
    h("div", { class: "summary-actions" },
      missed.length ? h("button", { class: "btn", onclick: onRetry }, "Review mistakes") : null,
      h("button", { class: "btn btn-primary", onclick: onExit }, "Back to overview")
    )
  );
}

/* ------------------------------------------------------------------ */
/* item renderers                                                      */
/* ------------------------------------------------------------------ */

function wordDetail(word) {
  return h("div", { class: "detail" },
    h("p", { class: "detail-line" },
      h("span", { class: "detail-hanzi" }, word.hanzi),
      h("span", { class: "detail-pinyin" }, word.pinyin),
      speaker(word.hanzi, { small: true })
    ),
    h("p", { class: "detail-meaning" }, meaningOf(word)),
    word.example ? h("div", { class: "detail-example" },
      h("p", { class: "ex-hanzi" }, word.example, speaker(word.example, { small: true })),
      h("p", { class: "ex-pinyin" }, word.examplePinyin),
      h("p", { class: "ex-en" }, word.exampleTranslation)
    ) : null
  );
}

function optionList(labels, onPick, { chinese = false, columns = 1 } = {}) {
  const list = h("div", { class: `options ${chinese ? "options-zh" : ""} ${columns === 2 ? "options-2" : ""}`, role: "group" });
  const buttons = labels.map((label, i) => {
    const btn = h("button", {
      class: "option", type: "button", dataset: { index: String(i) },
      onclick: () => onPick(i, btn, buttons)
    },
      h("span", { class: "option-key", "aria-hidden": "true" }, String(i + 1)),
      h("span", { class: "option-label" }, label)
    );
    if (i === 0) btn.dataset.autofocus = "";
    list.append(btn);
    return btn;
  });
  const onKey = (e) => {
    if (!buttons[0].isConnected) { document.removeEventListener("keydown", onKey); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= buttons.length && !buttons[n - 1].disabled) {
      buttons[n - 1].click();
    }
  };
  document.addEventListener("keydown", onKey);
  list.addEventListener("pick-done", () => document.removeEventListener("keydown", onKey));
  return { list, buttons, done: () => list.dispatchEvent(new Event("pick-done")) };
}

function markAnswers(buttons, chosen, answer) {
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === answer) b.classList.add("is-correct");
    if (i === chosen && chosen !== answer) b.classList.add("is-wrong");
  });
}

function renderItem(item, ctx) {
  switch (item.type) {
    case "flash": return renderFlash(item, ctx);
    case "choice": return renderChoice(item, ctx);
    case "pinyin": return renderPinyin(item, ctx);
    case "tone": return renderTone(item, ctx);
    case "listen": return renderListen(item, ctx);
    case "sentence": return renderSentence(item, ctx);
    case "grammar": return renderGrammar(item, ctx);
    case "cloze": return renderCloze(item, ctx);
    case "rule": return renderRule(item, ctx);
    default: return h("p", {}, "Unknown exercise");
  }
}

/* --- flashcard --- */
function renderFlash(item, ctx) {
  const w = item.word;
  const wrap = h("div", { class: "card-flash" });
  const front = h("div", { class: "flash-face" },
    h("p", { class: "flash-kicker" }, S.isNew(w.id) ? "New word" : "Do you know this?"),
    h("p", { class: "flash-hanzi", lang: "zh-CN" }, w.hanzi),
    speaker(w.hanzi),
    h("button", { class: "btn btn-primary flash-reveal", dataset: { autofocus: "" }, onclick: reveal }, "Show meaning")
  );
  wrap.append(front);

  function reveal() {
    clear(wrap);
    const knew = h("button", { class: "btn btn-primary" }, "I knew it");
    const still = h("button", { class: "btn" }, "Still learning");
    knew.addEventListener("click", () => ctx.selfReport(true, w, knew));
    still.addEventListener("click", () => ctx.selfReport(false, w, still));
    wrap.append(
      h("div", { class: "flash-face flash-open" },
        h("p", { class: "flash-hanzi small", lang: "zh-CN" }, w.hanzi, speaker(w.hanzi, { small: true })),
        h("p", { class: "flash-pinyin" }, w.pinyin),
        h("p", { class: "flash-meaning" }, meaningOf(w)),
        w.example ? h("div", { class: "detail-example" },
          h("p", { class: "ex-hanzi" }, w.example, speaker(w.example, { small: true })),
          h("p", { class: "ex-pinyin" }, w.examplePinyin),
          h("p", { class: "ex-en" }, w.exampleTranslation)
        ) : null,
        h("p", { class: "flash-chars" }, `${w.chars.length} character${w.chars.length > 1 ? "s" : ""} · HSK ${w.level} · ${w.category}`)
      ),
      h("div", { class: "flash-actions" }, still, knew)
    );
    knew.focus({ preventScroll: true });
  }

  return wrap;
}

/* --- multiple choice --- */
function renderChoice(item, ctx) {
  const w = item.word;
  const prompt = item.reverse
    ? h("div", { class: "prompt" },
        h("p", { class: "prompt-kicker" }, "Which character means this?"),
        h("p", { class: "prompt-en" }, meaningOf(w)))
    : h("div", { class: "prompt" },
        h("p", { class: "prompt-kicker" }, "What does this mean?"),
        h("p", { class: "prompt-hanzi", lang: "zh-CN" }, w.hanzi),
        speaker(w.hanzi));

  const labels = item.options.map((o) => (item.reverse ? o.hanzi : meaningOf(o)));
  const { list, buttons, done } = optionList(labels, (i, btn) => {
    markAnswers(buttons, i, item.answer);
    done();
    ctx.answer(i === item.answer, { anchor: btn, word: w, detail: wordDetail(w) });
  }, { chinese: item.reverse, columns: item.reverse ? 2 : 1 });

  return h("div", { class: "card-quiz" }, prompt, list);
}

/* --- pinyin --- */
function renderPinyin(item, ctx) {
  const w = item.word;
  const prompt = item.reverse
    ? h("div", { class: "prompt" },
        h("p", { class: "prompt-kicker" }, "Which characters match this pinyin?"),
        h("p", { class: "prompt-pinyin" }, w.pinyin),
        speaker(w.hanzi))
    : h("div", { class: "prompt" },
        h("p", { class: "prompt-kicker" }, "What is the pinyin?"),
        h("p", { class: "prompt-hanzi", lang: "zh-CN" }, w.hanzi));

  const labels = item.reverse ? item.options.map((o) => o.hanzi) : item.options;
  const { list, buttons, done } = optionList(labels, (i, btn) => {
    markAnswers(buttons, i, item.answer);
    done();
    ctx.answer(i === item.answer, { anchor: btn, word: w, grade: false, detail: wordDetail(w) });
  }, { chinese: item.reverse, columns: 2 });

  return h("div", { class: "card-quiz" }, prompt, list);
}

/* --- tone --- */
function renderTone(item, ctx) {
  const toneLabels = ["1st tone (flat)", "2nd tone (rising)", "3rd tone (dip)", "4th tone (falling)", "Neutral tone"];
  const options = [1, 2, 3, 4, 5];
  const prompt = h("div", { class: "prompt" },
    h("p", { class: "prompt-kicker" }, "Which tone is this?"),
    h("p", { class: `prompt-pinyin tone-mark t${item.tone}` }, item.syllable),
    h("p", { class: "prompt-sub", lang: "zh-CN" }, item.hanzi ? `${item.hanzi} · ${item.gloss}` : item.gloss),
    speaker(item.hanzi || item.syllable)
  );
  const { list, buttons, done } = optionList(toneLabels, (i, btn) => {
    const answer = options.indexOf(item.tone);
    markAnswers(buttons, i, answer);
    done();
    const detail = h("div", { class: "detail" },
      h("p", { class: "detail-line" },
        h("span", { class: `detail-pinyin tone-mark t${item.tone}` }, item.syllable),
        h("span", { class: "detail-hanzi", lang: "zh-CN" }, item.hanzi || "")),
      h("p", { class: "detail-meaning" }, `${toneLabels[options.indexOf(item.tone)]} — ${item.gloss}`),
      item.set ? h("p", { class: "tone-family" }, item.set.items.map((x) =>
        h("span", { class: `tone-chip t${x[1]}` }, `${x[0]} ${x[2]}`))) : null
    );
    ctx.answer(i === answer, { anchor: btn, detail });
  }, { columns: 2 });

  return h("div", { class: "card-quiz" }, prompt, list);
}

/* --- listening --- */
function renderListen(item, ctx) {
  const play = h("button", { class: "listen-btn", type: "button", dataset: { autofocus: "" } },
    h("span", { class: "listen-ico", "aria-hidden": "true" }, "◗"),
    h("span", {}, "Play audio"));

  const card = h("div", { class: "card-quiz" },
    h("div", { class: "prompt" },
      h("p", { class: "prompt-kicker" }, "Listen, then choose what you heard"),
      play,
      h("p", { class: "prompt-hint" }, "You can replay as often as you like.")
    )
  );

  if (!ttsAvailable()) {
    play.disabled = true;
    card.querySelector(".prompt").append(h("p", { class: "notice" }, TTS_UNAVAILABLE));
  } else {
    play.addEventListener("click", () => {
      speak(item.target.text);
      play.classList.add("is-playing");
      setTimeout(() => play.classList.remove("is-playing"), 1200);
    });
    setTimeout(() => speak(item.target.text), 350);
  }

  const labels = item.options.map((o) => o.text);
  const { list, buttons, done } = optionList(labels, (i, btn) => {
    markAnswers(buttons, i, item.answer);
    done();
    const detail = h("div", { class: "detail" },
      h("p", { class: "ex-hanzi" }, item.target.text, speaker(item.target.text, { small: true })),
      h("p", { class: "ex-pinyin" }, item.target.pinyin),
      h("p", { class: "ex-en" }, item.target.en)
    );
    ctx.answer(i === item.answer, { anchor: btn, word: item.word, detail });
  }, { chinese: true });

  card.append(list);
  return card;
}

/* --- sentence builder --- */
function renderSentence(item, ctx) {
  const s = item.sentence;
  const target = s.chunks.join("");
  const tray = h("div", { class: "tray" });
  const line = h("div", { class: "build-line", "aria-live": "polite" });
  const placed = [];

  const check = h("button", { class: "btn btn-primary", disabled: true }, "Check sentence");
  const undo = h("button", { class: "btn btn-ghost", disabled: true }, "Undo");

  function refresh() {
    clear(line);
    if (!placed.length) line.append(h("span", { class: "build-hint" }, "Tap the words in the right order"));
    placed.forEach((p, i) => {
      line.append(h("button", {
        class: "chip chip-placed", type: "button", lang: "zh-CN",
        "aria-label": `Remove ${p.text}`,
        onclick: () => { p.btn.disabled = false; placed.splice(i, 1); refresh(); }
      }, p.text));
    });
    check.disabled = placed.length !== s.chunks.length;
    undo.disabled = placed.length === 0;
  }

  shuffle(s.chunks).forEach((chunk, i) => {
    const btn = h("button", { class: "chip", type: "button", lang: "zh-CN", dataset: i === 0 ? { autofocus: "" } : {} }, chunk);
    btn.addEventListener("click", () => {
      btn.disabled = true;
      placed.push({ text: chunk, btn });
      refresh();
    });
    tray.append(btn);
  });

  undo.addEventListener("click", () => {
    const last = placed.pop();
    if (last) last.btn.disabled = false;
    refresh();
  });

  check.addEventListener("click", () => {
    const built = placed.map((p) => p.text).join("");
    const correct = built === target;
    check.disabled = true; undo.disabled = true;
    tray.querySelectorAll("button").forEach((b) => (b.disabled = true));
    const detail = h("div", { class: "detail" },
      h("p", { class: "ex-hanzi" }, target, speaker(target, { small: true })),
      h("p", { class: "ex-pinyin" }, s.pinyin),
      h("p", { class: "ex-en" }, s.en),
      h("p", { class: "detail-note" }, s.note)
    );
    ctx.answer(correct, { anchor: check, detail });
  });

  refresh();
  return h("div", { class: "card-quiz" },
    h("div", { class: "prompt" },
      h("p", { class: "prompt-kicker" }, "Build this sentence"),
      h("p", { class: "prompt-en" }, s.en)),
    line, tray,
    h("div", { class: "build-actions" }, undo, check)
  );
}

/* --- grammar --- */
function renderGrammar(item, ctx) {
  const g = item.point;
  const lang = S.get().settings.meaning;
  const card = h("div", { class: "card-quiz" },
    h("div", { class: "grammar-teach" },
      h("p", { class: "grammar-marker", lang: "zh-CN" }, g.marker),
      h("h3", {}, g.title),
      h("p", { class: "grammar-text" }, lang === "de" ? g.de : g.en),
      h("ul", { class: "grammar-examples" }, g.examples.map(([zh, py, en]) =>
        h("li", {},
          h("p", { class: "ex-hanzi" }, zh, speaker(zh, { small: true })),
          h("p", { class: "ex-pinyin" }, py),
          h("p", { class: "ex-en" }, en))))
    ),
    h("p", { class: "prompt-kicker quiz-kicker" }, g.quiz.q)
  );

  const { list, buttons, done } = optionList(g.quiz.options, (i, btn) => {
    markAnswers(buttons, i, g.quiz.answer);
    done();
    ctx.answer(i === g.quiz.answer, {
      anchor: btn,
      detail: h("div", { class: "detail" }, h("p", { class: "detail-note" }, g.quiz.note))
    });
  }, { columns: 2 });

  card.append(list);
  return card;
}

/* --- gap fill --- */
function renderCloze(item, ctx) {
  const c = item.entry;
  const [before, after] = c.text.split("___");
  const blank = h("span", { class: "gap" }, "?");
  const line = h("p", { class: "cloze-text", lang: "zh-CN" },
    h("span", {}, before), blank, h("span", {}, after));

  const card = h("div", { class: "card-quiz card-cloze" },
    h("div", { class: "prompt" },
      h("p", { class: "prompt-kicker" }, "Which word fills the gap?"),
      line,
      h("p", { class: "cloze-en" }, c.en)),
  );

  const { list, buttons, done } = optionList(c.options, (i, btn) => {
    markAnswers(buttons, i, c.answer);
    done();
    const right = i === c.answer;
    blank.textContent = c.options[c.answer];
    blank.classList.add("is-filled", right ? "was-right" : "was-wrong");
    line.append(speaker(c.text.replace("___", c.options[c.answer]), { small: true }));
    ctx.answer(right, {
      anchor: btn,
      detail: h("div", { class: "detail" },
        h("p", { class: "detail-line", lang: "zh-CN" }, c.text.replace("___", c.options[c.answer])),
        h("p", { class: "detail-pinyin" }, c.pinyin),
        h("p", { class: "detail-note" }, c.why),
        c.tag ? h("p", { class: "detail-tag", lang: "zh-CN" }, c.tag) : null)
    });
  }, { chinese: true, columns: 2 });

  card.append(list);
  return card;
}

/* --- read a rule, then answer --- */
function renderRule(item, ctx) {
  const r = item.rule;
  const lang = S.get().settings.meaning;
  const card = h("div", { class: "card-quiz card-rule" },
    h("div", { class: "grammar-teach" },
      h("p", { class: "grammar-marker", lang: "zh-CN" }, r.marker || "规"),
      h("h3", {}, r.title),
      h("p", { class: "grammar-text" }, lang === "de" ? r.de : r.en),
      h("ul", { class: "grammar-examples" }, r.examples.map(([zh, py, en]) =>
        h("li", {},
          h("p", { class: "ex-hanzi" }, zh, /[\u4e00-\u9fff]/.test(zh) ? speaker(zh, { small: true }) : null),
          h("p", { class: "ex-pinyin" }, py),
          h("p", { class: "ex-en" }, en))))
    ),
    h("p", { class: "prompt-kicker quiz-kicker" }, r.check.q)
  );

  const { list, buttons, done } = optionList(r.check.options, (i, btn) => {
    markAnswers(buttons, i, r.check.answer);
    done();
    ctx.answer(i === r.check.answer, {
      anchor: btn,
      detail: h("div", { class: "detail" }, h("p", { class: "detail-note" }, r.check.note))
    });
  }, { columns: 2 });

  card.append(list);
  return card;
}
