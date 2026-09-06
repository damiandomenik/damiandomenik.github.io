/* Character practice.
   This is honest tracing practice: a guide character, a 米 grid, undo and clear.
   There is no handwriting recognition here — nothing pretends to grade your strokes. */

import { characterDeck } from "../data/vocab.js";
import * as S from "./state.js";
import { h, clear, speaker, shuffle, toast, meaningOf } from "./ui.js";

const STROKE_RULES = [
  "Top to bottom, left to right.",
  "Horizontal strokes before crossing verticals: 十 is 一 then 丨.",
  "Left-falling before right-falling: 人 is 丿 then ㇏.",
  "Outside before inside, then close the box last: 国.",
  "Centre before the two sides in symmetric characters: 小."
];

export function renderWriter(host, { level = 1 } = {}) {
  clear(host);
  let deck = shuffle(characterDeck(level)).slice(0, 60);
  let pos = 0;

  const glyph = h("p", { class: "write-glyph", lang: "zh-CN" });
  const info = h("div", { class: "write-info" });
  const counter = h("p", { class: "write-count" });
  const canvas = h("canvas", { class: "write-canvas", "aria-label": "Writing practice area" });
  const guideToggle = h("button", { class: "btn btn-ghost", type: "button", "aria-pressed": "true" }, "Guide on");
  const undoBtn = h("button", { class: "btn btn-ghost", type: "button" }, "Undo");
  const clearBtn = h("button", { class: "btn btn-ghost", type: "button" }, "Clear");
  const doneBtn = h("button", { class: "btn btn-primary", type: "button" }, "Practised — next");

  let ctx, dpr = 1, size = 320, showGuide = true;
  let strokes = [], currentStroke = null, drawing = false;

  function fit() {
    const wrapWidth = canvas.parentElement.clientWidth;
    size = Math.max(220, Math.min(420, wrapWidth));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    redraw();
  }

  function css(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function redraw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    // grid
    ctx.save();
    ctx.strokeStyle = css("--line", "#d8d2c6");
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.moveTo(0, 0); ctx.lineTo(size, size);
    ctx.moveTo(size, 0); ctx.lineTo(0, size);
    ctx.stroke();
    ctx.restore();

    // guide character
    if (showGuide) {
      ctx.save();
      ctx.fillStyle = css("--guide", "rgba(120,120,120,0.18)");
      ctx.font = `${Math.round(size * 0.78)}px "Noto Serif SC","Songti SC","SimSun",serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(deck[pos].char, size / 2, size / 2 + size * 0.03);
      ctx.restore();
    }

    // strokes
    ctx.save();
    ctx.strokeStyle = css("--ink", "#1b1c1a");
    ctx.lineWidth = Math.max(6, size * 0.028);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes) {
      if (stroke.length < 2) {
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = css("--ink", "#1b1c1a");
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    }
    ctx.restore();
    counter.textContent = `${strokes.length} stroke${strokes.length === 1 ? "" : "s"} drawn`;
    undoBtn.disabled = strokes.length === 0;
    clearBtn.disabled = strokes.length === 0;
  }

  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    currentStroke = [point(e)];
    strokes.push(currentStroke);
    redraw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    e.preventDefault();
    currentStroke.push(point(e));
    redraw();
  });
  const end = () => { drawing = false; currentStroke = null; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", end);

  undoBtn.addEventListener("click", () => { strokes.pop(); redraw(); });
  clearBtn.addEventListener("click", () => { strokes = []; redraw(); });
  guideToggle.addEventListener("click", () => {
    showGuide = !showGuide;
    guideToggle.textContent = showGuide ? "Guide on" : "Guide off";
    guideToggle.setAttribute("aria-pressed", String(showGuide));
    redraw();
  });

  doneBtn.addEventListener("click", () => {
    S.recordCharacterPractice(1);
    S.addXP(5, "write");
    pos = (pos + 1) % deck.length;
    strokes = [];
    load();
    toast("Character logged");
  });

  function load() {
    const entry = deck[pos];
    glyph.textContent = entry.char;
    clear(info);
    const words = entry.words.slice(0, 3);
    info.append(
      h("p", { class: "write-kicker" }, `Character ${pos + 1} of ${deck.length} · HSK ${entry.level}`),
      h("ul", { class: "write-words" }, words.map((w) =>
        h("li", {},
          h("span", { class: "ww-hanzi", lang: "zh-CN" }, w.hanzi),
          h("span", { class: "ww-pinyin" }, w.pinyin),
          h("span", { class: "ww-en" }, meaningOf(w)),
          speaker(w.hanzi, { small: true }))))
    );
    redraw();
  }

  host.append(
    h("section", { class: "write-wrap" },
      h("header", { class: "view-head" },
        h("p", { class: "view-hanzi", "aria-hidden": "true" }, "写"),
        h("h2", {}, "Character practice"),
        h("p", { class: "view-sub" }, "Trace over the guide, then draw it again with the guide off.")
      ),
      h("div", { class: "write-grid" },
        h("div", { class: "write-canvas-wrap" },
          canvas,
          counter,
          h("div", { class: "write-tools" }, guideToggle, undoBtn, clearBtn, doneBtn)
        ),
        h("aside", { class: "write-side" },
          h("div", { class: "write-target" }, glyph),
          info,
          h("div", { class: "write-rules" },
            h("h3", {}, "Stroke order basics"),
            h("ol", {}, STROKE_RULES.map((r) => h("li", {}, r))),
            h("p", { class: "write-note" }, "These general rules cover most characters. This tool traces and counts your strokes — it does not check them.")
          )
        )
      )
    )
  );

  load();
  fit();
  const onResize = () => fit();
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}
