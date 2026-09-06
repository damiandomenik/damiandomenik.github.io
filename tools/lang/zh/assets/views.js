/* Views. Each function renders into `host` and uses ctx.go() / ctx.start() to move on. */

import { VOCAB, LEVELS as HSK_LEVELS, CATEGORIES, CATEGORY_LABELS, searchVocab, toneOf } from "../data/vocab.js";
import { GRAMMAR, TONE_INFO } from "../data/grammar.js";
import { RULES, RULE_GROUPS, CLOZE } from "../data/rules.js";
import * as S from "./state.js";
import { ttsAvailable, chineseVoices, onVoicesReady, TTS_UNAVAILABLE } from "./audio.js";
import { buildQuickSession, buildModeSession, buildReviewSession, buildWordSession, buildGrammarSession, buildRuleSession, buildClozeSession } from "./session.js";
import { h, clear, bar, speaker, toast, meaningOf, fmtDuration, cycleTheme, applyTheme, pinyinTones } from "./ui.js";

export function currentLevel() {
  const l = Number(S.get().settings.level) || 1;
  return Math.min(4, Math.max(1, l));
}
function setLevel(n) { S.setSetting("level", n); }

function levelPicker(onChange, { compact = false } = {}) {
  const active = currentLevel();
  return h("div", { class: `level-pick ${compact ? "compact" : ""}`, role: "tablist", "aria-label": "HSK level" },
    HSK_LEVELS.map((lv) => {
      const st = S.levelStats(lv.level);
      const btn = h("button", {
        class: `level-tab ${lv.level === active ? "is-active" : ""}`,
        type: "button", role: "tab", "aria-selected": String(lv.level === active),
        onclick: () => { setLevel(lv.level); onChange(lv.level); }
      },
        h("span", { class: "level-tab-zh", lang: "zh-CN", "aria-hidden": "true" }, lv.hanzi),
        h("span", { class: "level-tab-name" }, lv.label),
        compact ? null : h("span", { class: "level-tab-meta" }, `${st.pct}% · ${st.total} words`),
        compact ? null : bar(st.pct, { label: `${lv.label} mastery` })
      );
      return btn;
    })
  );
}

/* ------------------------------------------------------------------ */
/* overview                                                            */
/* ------------------------------------------------------------------ */

export function overview(host, ctx) {
  clear(host);
  const level = currentLevel();
  const d = S.daily();
  const streak = S.streakDisplay();
  const li = S.levelInfo();
  const goal = S.DAILY_GOAL;
  const goalDone = Math.min(1, (d.vocab / goal.vocab + d.listening / goal.listening + d.characters / goal.characters + d.grammar / goal.grammar) / 4);
  const due = S.dueCards(0, 40);
  const ch = S.challenge();

  const today = h("section", { class: "panel today" },
    h("div", { class: "today-head" },
      h("div", {},
        h("p", { class: "panel-zh", lang: "zh-CN" }, "今日学习"),
        h("h2", {}, "Today's study")),
      h("p", { class: `streak ${streak ? "" : "cold"}` },
        h("span", { class: "streak-num" }, streak),
        h("span", { class: "streak-label" }, streak === 1 ? "day streak" : "day streak"))
    ),
    h("div", { class: "today-bar" },
      bar(goalDone * 100, { label: "Daily goal" }),
      h("p", { class: "today-meta" }, `${d.xp} XP today · goal ${Math.round(goalDone * 100)}% complete`)
    ),
    h("ul", { class: "goal-list" },
      [["vocab", "Vocabulary", "词"], ["listening", "Listening", "听"], ["characters", "Characters", "写"], ["grammar", "Grammar", "法"]]
        .map(([key, label, zh]) => {
          const have = d[key], need = goal[key];
          return h("li", { class: have >= need ? "is-done" : "" },
            h("span", { class: "goal-zh", lang: "zh-CN", "aria-hidden": "true" }, zh),
            h("span", { class: "goal-label" }, label),
            h("span", { class: "goal-count" }, `${Math.min(have, need)} / ${need}`),
            bar((have / need) * 100, { size: "thin", label: `${label} goal` })
          );
        })
    ),
    h("button", { class: "btn btn-primary btn-lg", onclick: () => ctx.start(buildQuickSession(level)) },
      S.streakAtRisk() && streak ? "Keep your streak going" : "Continue learning"),
    h("p", { class: "today-note" }, `Next up: HSK ${level} · ${S.newWords(level, 99).length} words still new`)
  );

  const challenge = h("section", { class: "panel challenge" },
    h("div", { class: "panel-head" },
      h("div", {},
        h("p", { class: "panel-zh", lang: "zh-CN" }, "每日挑战"),
        h("h2", {}, "Daily challenge")),
      h("p", { class: "challenge-reward" }, `+${ch.reward} XP`)),
    h("ul", { class: "challenge-list" }, ch.tasks.map((t) =>
      h("li", { class: t.have >= t.need ? "is-done" : "" },
        h("span", { class: "check", "aria-hidden": "true" }, t.have >= t.need ? "✓" : ""),
        h("span", {}, t.label),
        h("span", { class: "challenge-count" }, `${t.have}/${t.need}`)))),
    ch.claimed
      ? h("p", { class: "challenge-claimed" }, "Claimed today. New challenge tomorrow.")
      : h("button", {
          class: "btn " + (ch.complete ? "btn-primary" : ""), disabled: !ch.complete,
          onclick: () => { if (S.claimChallenge()) { toast("Challenge complete — +25 XP"); overview(host, ctx); } }
        }, ch.complete ? "Claim reward" : "Finish the tasks to claim")
  );

  const reviewPanel = h("section", { class: "panel review-panel" },
    h("div", { class: "panel-head" },
      h("div", {},
        h("p", { class: "panel-zh", lang: "zh-CN" }, "复习"),
        h("h2", {}, "Due for review")),
      h("p", { class: "panel-count" }, due.length ? `${due.length} words` : "")),
    due.length
      ? h("div", {},
          h("ul", { class: "due-chips" }, due.slice(0, 8).map((w) =>
            h("li", { lang: "zh-CN" }, w.hanzi))),
          h("button", { class: "btn", onclick: () => ctx.start(buildReviewSession(0)) }, "Start review"))
      : h("div", { class: "empty-inline" },
          h("p", {}, S.countStudied() ? "You're all caught up 🎉" : "Start your first lesson to build a review queue."),
          h("button", { class: "btn", onclick: () => ctx.start(buildQuickSession(level)) }, S.countStudied() ? "Study ahead" : "Start your first lesson"))
  );

  const levels = h("section", { class: "panel levels" },
    h("div", { class: "panel-head" },
      h("div", {},
        h("p", { class: "panel-zh", lang: "zh-CN" }, "等级"),
        h("h2", {}, "Your HSK levels"))),
    levelPicker(() => overview(host, ctx))
  );

  const unlocked = Object.keys(S.get().achievements).length;
  const rank = h("section", { class: "panel rank" },
    h("div", { class: "rank-main" },
      h("p", { class: "rank-zh", lang: "zh-CN", "aria-hidden": "true" }, li.hanzi),
      h("div", {},
        h("p", { class: "rank-kicker" }, `Level ${li.index}`),
        h("h2", {}, li.name),
        bar(li.pct, { label: "Progress to next level" }),
        h("p", { class: "rank-meta" }, li.next ? `${li.into} / ${li.span} XP to ${li.next.name}` : "Top level reached"))),
    h("div", { class: "rank-side" },
      h("p", {}, h("strong", {}, S.get().xp), h("span", {}, " XP total")),
      h("p", {}, h("strong", {}, unlocked), h("span", {}, ` / ${S.ACHIEVEMENTS.length} achievements`)),
      h("button", { class: "btn btn-ghost", onclick: () => ctx.go("#/progress") }, "See progress"))
  );

  host.append(
    h("div", { class: "stack" }, today, h("div", { class: "cols" }, challenge, reviewPanel), levels, rank)
  );
}

/* ------------------------------------------------------------------ */
/* learn                                                               */
/* ------------------------------------------------------------------ */

const MODES = [
  { key: "flash", zh: "词", title: "Vocabulary", desc: "Flashcards with pinyin, meaning and an example sentence." },
  { key: "choice", zh: "选", title: "Multiple choice", desc: "Match characters and meanings both ways." },
  { key: "listen", zh: "听", title: "Listening", desc: "Hear a sentence and pick what was said.", needsTTS: true },
  { key: "pinyin", zh: "拼", title: "Pinyin", desc: "Read tones correctly and match sound to characters." },
  { key: "tone", zh: "声", title: "Tones", desc: "Tell the four tones and the neutral tone apart." },
  { key: "sentence", zh: "句", title: "Sentence building", desc: "Put words in the right order, with a grammar note." },
  { key: "grammar", zh: "法", title: "Grammar", desc: "Short explanations with a quick check." },
  { key: "cloze", zh: "填", title: "Fill the gap", desc: "Read a sentence, choose the word that belongs in the blank." },
  { key: "rules", zh: "规", title: "Rule check", desc: "Read a rule, then answer a question about it." },
  { key: "write", zh: "写", title: "Characters", desc: "Trace characters on a grid, with stroke order basics." }
];

export function learn(host, ctx) {
  clear(host);
  const level = currentLevel();
  const grid = h("div", { class: "mode-grid" });

  const render = () => {
    clear(grid);
    MODES.forEach((m) => {
      const blocked = m.needsTTS && !ttsAvailable();
      const card = h("button", {
        class: `mode-card ${blocked ? "is-blocked" : ""}`, type: "button", disabled: blocked,
        onclick: () => {
          if (m.key === "write") return ctx.go("#/write");
          ctx.start(buildModeSession(m.key, currentLevel()));
        }
      },
        h("span", { class: "mode-zh", lang: "zh-CN", "aria-hidden": "true" }, m.zh),
        h("span", { class: "mode-title" }, m.title),
        h("span", { class: "mode-desc" }, blocked ? TTS_UNAVAILABLE : m.desc)
      );
      grid.append(card);
    });
  };
  render();
  onVoicesReady(render);

  host.append(
    h("section", { class: "view" },
      h("header", { class: "view-head" },
        h("p", { class: "view-hanzi", lang: "zh-CN", "aria-hidden": "true" }, "学"),
        h("h2", {}, "Learn"),
        h("p", { class: "view-sub" }, "Pick a level, then a mode. Every session mixes new words with the ones you are about to forget. The rules behind the grammar live under Rules.")),
      levelPicker(() => learn(host, ctx)),
      grid,
      h("div", { class: "panel quick-start" },
        h("h3", {}, "Not sure where to start?"),
        h("p", {}, `A mixed HSK ${level} session takes five to ten minutes: new and due vocabulary, listening, two grammar points and two gap-fill sentences.`),
        h("button", { class: "btn btn-primary", onclick: () => ctx.start(buildQuickSession(currentLevel())) }, "Start mixed session"))
    )
  );
}

/* ------------------------------------------------------------------ */
/* review                                                              */
/* ------------------------------------------------------------------ */

export function review(host, ctx) {
  clear(host);
  const due = S.dueCards(0, 200);
  const soon = VOCAB.filter((w) => {
    const c = S.card(w.id);
    return c && c.due > Date.now() && c.due < Date.now() + 86400000 * 3;
  });

  host.append(
    h("section", { class: "view" },
      h("header", { class: "view-head" },
        h("p", { class: "view-hanzi", lang: "zh-CN", "aria-hidden": "true" }, "复习"),
        h("h2", {}, "Review"),
        h("p", { class: "view-sub" }, "Words come back right before you would forget them. Getting one wrong brings it back sooner.")),
      due.length
        ? h("div", { class: "panel" },
            h("p", { class: "panel-count big" }, `${due.length} due now`),
            h("ul", { class: "due-list" }, due.slice(0, 24).map((w) =>
              h("li", {},
                h("span", { class: "dl-hanzi", lang: "zh-CN" }, w.hanzi),
                h("span", { class: "dl-pinyin" }, w.pinyin),
                h("span", { class: "dl-en" }, meaningOf(w)),
                bar(S.mastery(w.id), { size: "thin", label: "Mastery" })))),
            h("button", { class: "btn btn-primary", onclick: () => ctx.start(buildReviewSession(0, 20)) }, "Start review"))
        : h("div", { class: "empty-state" },
            h("p", { class: "empty-hanzi", lang: "zh-CN", "aria-hidden": "true" }, "空"),
            h("h3", {}, "You're all caught up 🎉"),
            h("p", {}, soon.length ? `${soon.length} words come back within three days.` : "Study some new words and they will show up here."),
            h("button", { class: "btn", onclick: () => ctx.go("#/learn") }, "Learn something new")),
      soon.length ? h("div", { class: "panel" },
        h("h3", {}, "Coming up"),
        h("ul", { class: "due-chips" }, soon.slice(0, 14).map((w) => h("li", { lang: "zh-CN" }, w.hanzi)))) : null
    )
  );
}

/* ------------------------------------------------------------------ */
/* vocabulary                                                          */
/* ------------------------------------------------------------------ */

export function vocabulary(host, ctx) {
  clear(host);
  let category = "";
  let level = 0;
  let query = "";

  const results = h("div", { class: "word-list" });
  const input = h("input", {
    class: "search-input", type: "search", id: "vocab-search",
    placeholder: "你好, nǐ hǎo, hallo, hello…", autocomplete: "off", spellcheck: "false",
    "aria-label": "Search vocabulary"
  });
  const countLine = h("p", { class: "list-count", "aria-live": "polite" });

  function currentSet() {
    if (query.trim()) return searchVocab(query, { level });
    let list = VOCAB;
    if (level) list = list.filter((w) => w.level === level);
    if (category) list = list.filter((w) => w.category === category);
    return list;
  }

  function draw() {
    const list = currentSet();
    clear(results);
    countLine.textContent = query.trim()
      ? `${list.length} match${list.length === 1 ? "" : "es"} for “${query.trim()}”`
      : `${list.length} words`;
    if (!list.length) {
      results.append(h("div", { class: "empty-inline" }, h("p", {}, "No word matches that. Try pinyin without tones, or an English word.")));
      return;
    }
    list.slice(0, 200).forEach((w) => results.append(wordRow(w, ctx)));
    if (list.length > 200) results.append(h("p", { class: "list-note" }, `Showing the first 200 of ${list.length}.`));
  }

  input.addEventListener("input", () => { query = input.value; draw(); });

  const catRow = h("div", { class: "chip-row" },
    h("button", { class: "chip-filter is-active", type: "button", onclick: (e) => selectCat("", e.target) }, "All"),
    CATEGORIES.map((c) => h("button", {
      class: "chip-filter", type: "button", onclick: (e) => selectCat(c.key, e.currentTarget)
    }, h("span", { lang: "zh-CN", class: "chip-zh" }, c.hanzi), h("span", {}, `${c.label} · ${c.count}`)))
  );

  function selectCat(key, btn) {
    category = key;
    [...catRow.querySelectorAll(".chip-filter")].forEach((b) => b.classList.toggle("is-active", b === btn));
    draw();
  }

  const levelRow = h("div", { class: "chip-row" },
    [["All levels", 0], ["HSK 1", 1], ["HSK 2", 2], ["HSK 3", 3]].map(([label, n], i) =>
      h("button", {
        class: `chip-filter ${i === 0 ? "is-active" : ""}`, type: "button",
        onclick: (e) => {
          level = n;
          [...levelRow.querySelectorAll(".chip-filter")].forEach((b) => b.classList.toggle("is-active", b === e.currentTarget));
          draw();
        }
      }, label))
  );

  host.append(
    h("section", { class: "view" },
      h("header", { class: "view-head" },
        h("p", { class: "view-hanzi", lang: "zh-CN", "aria-hidden": "true" }, "词"),
        h("h2", {}, "Vocabulary"),
        h("p", { class: "view-sub" }, `${VOCAB.length} words across HSK 1–3. Search by characters, pinyin or meaning.`)),
      h("div", { class: "search-wrap" }, input),
      levelRow, catRow, countLine, results)
  );

  draw();
}

function wordRow(w, ctx) {
  const m = S.mastery(w.id);
  const row = h("article", { class: "word-row" },
    h("button", {
      class: "word-main", type: "button", "aria-expanded": "false",
      onclick: () => {
        const open = row.classList.toggle("is-open");
        row.querySelector(".word-main").setAttribute("aria-expanded", String(open));
      }
    },
      h("span", { class: "wr-hanzi", lang: "zh-CN" }, w.hanzi),
      h("span", { class: "wr-mid" },
        h("span", { class: "wr-pinyin" }, pinyinTones(w.pinyin, toneOf)),
        h("span", { class: "wr-en" }, meaningOf(w))),
      h("span", { class: "wr-level" }, `HSK ${w.level}`)
    ),
    speaker(w.hanzi, { small: true }),
    h("div", { class: "word-detail" },
      w.example ? h("div", {},
        h("p", { class: "ex-hanzi", lang: "zh-CN" }, w.example, speaker(w.example, { small: true })),
        h("p", { class: "ex-pinyin" }, w.examplePinyin),
        h("p", { class: "ex-en" }, w.exampleTranslation)) : null,
      h("div", { class: "wd-foot" },
        h("span", { class: "wd-cat" }, CATEGORY_LABELS[w.category]?.[0] || w.category),
        h("span", { class: "wd-mastery" }, `Mastery ${m}%`),
        bar(m, { size: "thin", label: "Mastery" }),
        h("button", { class: "btn btn-ghost btn-sm", onclick: () => ctx.start(buildWordSession(w)) }, "Practise this word"))
    )
  );
  return row;
}

/* ------------------------------------------------------------------ */
/* hsk levels + grammar                                                */
/* ------------------------------------------------------------------ */

export function hsk(host, ctx) {
  clear(host);
  const panels = HSK_LEVELS.map((lv) => {
    const st = S.levelStats(lv.level);
    const points = GRAMMAR.filter((g) => g.level === lv.level);
    return h("section", { class: "panel level-panel" },
      h("div", { class: "level-head" },
        h("p", { class: "level-zh", lang: "zh-CN", "aria-hidden": "true" }, lv.hanzi),
        h("div", {},
          h("h2", {}, lv.label),
          h("p", { class: "level-meta" }, `${st.total} words · ${st.started} started · ${st.mastered} mastered`)),
        h("p", { class: "level-pct" }, `${st.pct}%`)),
      bar(st.pct, { label: `${lv.label} mastery` }),
      h("div", { class: "level-actions" },
        h("button", { class: "btn btn-primary btn-sm", onclick: () => { setLevel(lv.level); ctx.start(buildQuickSession(lv.level)); } }, "Study this level"),
        h("button", { class: "btn btn-ghost btn-sm", onclick: () => { setLevel(lv.level); ctx.go("#/vocab"); } }, "Browse words"),
        h("button", { class: "btn btn-ghost btn-sm", onclick: () => { setLevel(lv.level); ctx.go("#/rules"); } }, "Read the rules")),
      h("h3", { class: "grammar-heading" }, "Grammar"),
      h("ul", { class: "grammar-list" }, points.map((g) =>
        h("li", {},
          h("details", {},
            h("summary", {},
              h("span", { class: "gl-marker", lang: "zh-CN" }, g.marker),
              h("span", { class: "gl-title" }, g.title)),
            h("div", { class: "gl-body" },
              h("p", {}, S.get().settings.meaning === "de" ? g.de : g.en),
              h("ul", { class: "grammar-examples" }, g.examples.map(([zh, py, en]) =>
                h("li", {},
                  h("p", { class: "ex-hanzi", lang: "zh-CN" }, zh, speaker(zh, { small: true })),
                  h("p", { class: "ex-pinyin" }, py),
                  h("p", { class: "ex-en" }, en)))),
              h("button", { class: "btn btn-ghost btn-sm", onclick: () => ctx.start(buildGrammarSession(g)) }, "Quick check"))))))
    );
  });

  host.append(
    h("section", { class: "view" },
      h("header", { class: "view-head" },
        h("p", { class: "view-hanzi", lang: "zh-CN", "aria-hidden": "true" }, "级"),
        h("h2", {}, "HSK levels"),
        h("p", { class: "view-sub" }, "Mastery counts a word once you have recalled it correctly several times in a row.")),
      panels,
      h("section", { class: "panel rules-pointer" },
        h("h2", {}, "Rules and pronunciation"),
        h("p", {}, "Tone changes in real speech, word order, the particles and the patterns behind each level are collected in the rules section."),
        h("div", { class: "rule-actions" },
          h("button", { class: "btn btn-primary btn-sm", onclick: () => ctx.go("#/rules") }, "Open the rules"),
          h("button", { class: "btn btn-ghost btn-sm", onclick: () => ctx.start(buildModeSession("tone", currentLevel())) }, "Practise tones")))
    )
  );
}

/* ------------------------------------------------------------------ */
/* progress                                                            */
/* ------------------------------------------------------------------ */

export function progress(host, ctx) {
  clear(host);
  const st = S.get();
  const studied = S.countStudied();
  const acc = st.stats.answered ? Math.round((st.stats.correct / st.stats.answered) * 100) : 0;
  const skills = [
    ["vocab", "Vocabulary", "词"], ["pinyin", "Pinyin", "拼"], ["listening", "Listening", "听"],
    ["tone", "Tones", "声"], ["grammar", "Grammar", "法"], ["sentence", "Sentences", "句"]
  ];

  const stats = [
    ["Words studied", studied],
    ["Characters practised", st.stats.charsPracticed],
    ["Questions answered", st.stats.answered],
    ["Accuracy", `${acc}%`],
    ["Study time", fmtDuration(st.stats.studyMs)],
    ["Current streak", S.streakDisplay()],
    ["Longest streak", st.streak.longest],
    ["Sessions", st.stats.sessions]
  ];

  host.append(
    h("section", { class: "view" },
      h("header", { class: "view-head" },
        h("p", { class: "view-hanzi", lang: "zh-CN", "aria-hidden": "true" }, "进度"),
        h("h2", {}, "Progress"),
        h("p", { class: "view-sub" }, "Everything here is calculated from your own answers, in this browser.")),

      h("div", { class: "panel" },
        h("h3", {}, "Accuracy by skill"),
        h("ul", { class: "skill-list" }, skills.map(([key, label, zh]) => {
          const s = st.skills[key] || { c: 0, t: 0 };
          return h("li", {},
            h("span", { class: "sk-zh", lang: "zh-CN", "aria-hidden": "true" }, zh),
            h("span", { class: "sk-label" }, label),
            h("span", { class: "sk-val" }, s.t ? `${S.skillPct(key)}%` : "—"),
            bar(S.skillPct(key), { size: "thin", label: `${label} accuracy` }),
            h("span", { class: "sk-count" }, `${s.c}/${s.t}`));
        }))),

      h("div", { class: "panel" },
        h("h3", {}, "Numbers"),
        h("dl", { class: "stat-grid" }, stats.map(([k, v]) =>
          h("div", {}, h("dt", {}, k), h("dd", {}, String(v)))))),

      weekStrip(st),

      h("div", { class: "panel" },
        h("h3", {}, "Achievements"),
        h("ul", { class: "ach-grid" }, S.ACHIEVEMENTS.map((a) => {
          const got = st.achievements[a.id];
          return h("li", { class: got ? "is-got" : "" },
            h("span", { class: "ach-seal", lang: "zh-CN", "aria-hidden": "true" }, a.icon),
            h("div", {},
              h("p", { class: "ach-title" }, a.title),
              h("p", { class: "ach-desc" }, a.desc),
              got ? h("p", { class: "ach-date" }, new Date(got).toLocaleDateString()) : null));
        }))),

      settingsPanel(host, ctx),
      dataPanel(host, ctx)
    )
  );
}

function weekStrip(st) {
  const days = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = S.todayKey(d);
    const xp = st.streak.days[key] || 0;
    days.push({ key, xp, d });
  }
  const max = Math.max(20, ...days.map((x) => x.xp));
  return h("div", { class: "panel" },
    h("h3", {}, "Last four weeks"),
    h("div", { class: "week-strip", role: "img", "aria-label": `Daily XP for the last 28 days. Most active day: ${max} XP.` },
      days.map((x) => h("span", {
        class: `ws-day ${x.xp ? "on" : ""}`,
        style: `--h:${Math.max(6, Math.round((x.xp / max) * 100))}%`,
        title: `${x.key}: ${x.xp} XP`
      }))),
    h("p", { class: "list-note" }, "Each bar is one day of XP.")
  );
}

function settingsPanel(host, ctx) {
  const st = S.get();
  const voices = chineseVoices();
  const voiceSelect = h("select", {
    class: "select", id: "voice-select",
    onchange: (e) => S.setSetting("voice", e.target.value)
  },
    h("option", { value: "" }, voices.length ? "Automatic" : "No Chinese voice found"),
    voices.map((v) => h("option", { value: v.voiceURI, selected: st.settings.voice === v.voiceURI }, `${v.name} (${v.lang})`))
  );

  const rate = h("input", {
    type: "range", min: "0.5", max: "1.2", step: "0.05", value: String(st.settings.rate),
    id: "rate", class: "range",
    oninput: (e) => S.setSetting("rate", Number(e.target.value))
  });

  return h("div", { class: "panel" },
    h("h3", {}, "Settings"),
    h("div", { class: "settings-grid" },
      h("div", {},
        h("label", { for: "meaning-select" }, "Translation language"),
        h("select", {
          class: "select", id: "meaning-select",
          onchange: (e) => { S.setSetting("meaning", e.target.value); progress(host, ctx); }
        },
          h("option", { value: "en", selected: st.settings.meaning === "en" }, "English"),
          h("option", { value: "de", selected: st.settings.meaning === "de" }, "Deutsch"))),
      h("div", {},
        h("label", { for: "voice-select" }, "Chinese voice"),
        voiceSelect,
        ttsAvailable() ? null : h("p", { class: "notice" }, TTS_UNAVAILABLE)),
      h("div", {},
        h("label", { for: "rate" }, "Speech speed"),
        rate),
      h("div", {},
        h("label", { for: "theme-btn" }, "Appearance"),
        h("button", {
          class: "btn btn-ghost", id: "theme-btn", type: "button",
          onclick: (e) => { const next = cycleTheme(); e.target.textContent = themeLabel(next); }
        }, themeLabel(st.settings.theme)))
    )
  );
}

function themeLabel(mode) {
  return mode === "auto" ? "Follow system" : mode === "light" ? "Light" : "Dark";
}

function dataPanel(host, ctx) {
  const fileInput = h("input", { type: "file", accept: "application/json,.json", class: "visually-hidden", id: "import-file" });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      S.importJSON(await file.text());
      toast("Progress restored");
      applyTheme();
      progress(host, ctx);
    } catch (e) {
      toast(e.message || "That file could not be read.");
    } finally {
      fileInput.value = "";
    }
  });

  return h("div", { class: "panel data-panel" },
    h("h3", {}, "Your data"),
    h("p", { class: "lock-line" }, h("span", { "aria-hidden": "true" }, "🔒"), " Progress stored locally — nothing leaves this browser."),
    h("div", { class: "data-actions" },
      h("button", {
        class: "btn", onclick: () => {
          const blob = new Blob([S.exportJSON()], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = h("a", { href: url, download: `chinese-lab-${S.todayKey()}.json` });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast("Progress exported");
        }
      }, "Export progress"),
      h("button", { class: "btn", onclick: () => fileInput.click() }, "Import progress"),
      h("button", {
        class: "btn btn-danger", onclick: () => {
          if (confirm("Delete all local progress? This cannot be undone.")) {
            S.reset();
            toast("Progress reset");
            progress(host, ctx);
          }
        }
      }, "Reset progress"),
      fileInput)
  );
}

/* ------------------------------------------------------------------ */
/* rules — the reading section                                         */
/* ------------------------------------------------------------------ */

export function rules(host, ctx) {
  clear(host);
  const level = currentLevel();
  const lang = S.get().settings.meaning;
  const forLevel = RULES.filter((r) => r.level === level);
  const gaps = CLOZE.filter((c) => c.level === level);

  const groups = RULE_GROUPS
    .map((g) => ({ ...g, items: forLevel.filter((r) => r.group === g.key) }))
    .filter((g) => g.items.length);

  const ruleCard = (r) => {
    const body = h("div", { class: "rule-body" },
      h("p", { class: "rule-text" }, lang === "de" ? r.de : r.en),
      h("ul", { class: "rule-examples" }, r.examples.map(([zh, py, en]) =>
        h("li", {},
          h("p", { class: "ex-hanzi", lang: "zh-CN" }, zh, /[\u4e00-\u9fff]/.test(zh) ? speaker(zh, { small: true }) : null),
          h("p", { class: "ex-pinyin" }, py),
          h("p", { class: "ex-en" }, en)))),
      r.check
        ? h("div", { class: "rule-actions" },
            h("button", { class: "btn btn-ghost btn-sm", onclick: () => ctx.start(buildRuleSession(r)) }, "Check yourself"))
        : h("p", { class: "rule-note" }, "Nothing to quiz here — just worth knowing.")
    );

    return h("details", { class: "rule" },
      h("summary", {},
        h("span", { class: "rule-marker", lang: "zh-CN" }, r.marker || "规"),
        h("span", { class: "rule-title" }, r.title),
        h("span", { class: "rule-caret", "aria-hidden": "true" }, "＋")),
      body);
  };

  host.append(
    h("section", { class: "view" },
      h("header", { class: "view-head" },
        h("p", { class: "view-hanzi", lang: "zh-CN", "aria-hidden": "true" }, "规"),
        h("h2", {}, "Rules"),
        h("p", { class: "view-sub" }, "The patterns behind the words: how tones shift in real speech, where each part of a sentence goes, and what the little particles are doing.")),
      levelPicker(() => rules(host, ctx), { compact: true }),

      h("section", { class: "panel rules-intro" },
        h("p", { class: "rules-count" }, `${forLevel.length} rules · ${gaps.length} gap-fill sentences · HSK ${level}`),
        h("button", { class: "btn btn-primary btn-sm", onclick: () => ctx.start(buildClozeSession(level)) }, "Practise gap-fill"),
        h("button", { class: "btn btn-ghost btn-sm", onclick: () => ctx.start(buildModeSession("rules", level)) }, "Quiz me on these rules")),

      groups.map((g) =>
        h("section", { class: "panel rule-group" },
          h("h3", { class: "rule-group-head" },
            h("span", { class: "rule-group-zh", lang: "zh-CN", "aria-hidden": "true" }, g.hanzi),
            g.label,
            h("span", { class: "rule-group-count" }, String(g.items.length))),
          h("div", { class: "rule-list" }, g.items.map(ruleCard)))),

      level === 1
        ? h("section", { class: "panel" },
            h("h3", {}, "The five tones"),
            h("ul", { class: "tone-info" }, TONE_INFO.map((t) =>
              h("li", { class: `t${t.tone}` },
                h("span", { class: "ti-mark" }, t.mark),
                h("div", {},
                  h("p", { class: "ti-name" }, t.name),
                  h("p", { class: "ti-desc" }, t.desc)),
                h("span", { class: "ti-example", lang: "zh-CN" }, t.example)))),
            h("button", { class: "btn btn-ghost btn-sm", onclick: () => ctx.start(buildModeSession("tone", 1)) }, "Practise tones"))
        : null
    )
  );
}
