/* Small UI toolkit — no framework, just helpers used by every view. */

import { speak, ttsAvailable, TTS_UNAVAILABLE } from "./audio.js";
import { get, setSetting } from "./state.js";

export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(3)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = (arr, n) => shuffle(arr).slice(0, n);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function meaningOf(word) {
  return get().settings.meaning === "de" ? word.meaningDe : word.meaning;
}

/* ---------- progress bar ---------- */

export function bar(pct, { label = "", tone = "jade", size = "" } = {}) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const fill = h("i", { class: "bar-fill", style: "width:0%" });
  const wrap = h("div", {
    class: `bar ${size} tone-${tone}`, role: "progressbar",
    "aria-valuenow": p, "aria-valuemin": "0", "aria-valuemax": "100",
    "aria-label": label || `${p} percent`
  }, fill);
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = p + "%"; }));
  return wrap;
}

/* ---------- speaker button ---------- */

export function speaker(text, { small = false, label = "Play pronunciation" } = {}) {
  const btn = h("button", {
    class: `speak ${small ? "speak-sm" : ""}`, type: "button", "aria-label": label, title: label
  }, h("span", { class: "speak-ico", "aria-hidden": "true" }, "◗"));
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!ttsAvailable()) { toast(TTS_UNAVAILABLE); return; }
    speak(text);
    btn.classList.add("is-playing");
    setTimeout(() => btn.classList.remove("is-playing"), 900);
  });
  return btn;
}

/* ---------- toast ---------- */

let toastHost = null;
export function toast(message, { tone = "" } = {}) {
  if (!toastHost) {
    toastHost = h("div", { class: "toast-host", "aria-live": "polite" });
    document.body.append(toastHost);
  }
  const t = h("div", { class: `toast ${tone}` }, message);
  toastHost.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, 2600);
}

/* ---------- xp burst ---------- */

export function xpBurst(amount, anchor) {
  const node = h("span", { class: "xp-burst" }, `+${amount} XP`);
  const host = anchor || document.body;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    node.style.left = r.left + r.width / 2 + "px";
    node.style.top = r.top + "px";
    document.body.append(node);
  } else {
    node.classList.add("xp-burst-center");
    document.body.append(node);
  }
  setTimeout(() => node.remove(), reducedMotion() ? 800 : 1400);
}

export function countUp(node, from, to, ms = 700) {
  if (reducedMotion() || from === to) { node.textContent = to; return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- achievement popup ---------- */

export function achievementPopup(list) {
  if (!list || !list.length) return;
  const a = list[0];
  const card = h("div", { class: "ach-pop", role: "status" },
    h("span", { class: "ach-seal", "aria-hidden": "true" }, a.icon),
    h("div", {},
      h("p", { class: "ach-pop-kicker" }, "Achievement unlocked"),
      h("p", { class: "ach-pop-title" }, a.title),
      h("p", { class: "ach-pop-desc" }, a.desc)
    )
  );
  document.body.append(card);
  requestAnimationFrame(() => card.classList.add("in"));
  setTimeout(() => { card.classList.remove("in"); setTimeout(() => card.remove(), 400); }, 3200);
  if (list.length > 1) setTimeout(() => achievementPopup(list.slice(1)), 3600);
}

/* ---------- theme ---------- */

export function applyTheme(mode) {
  const m = mode || get().settings.theme || "auto";
  const root = document.documentElement;
  if (m === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", m);
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute("content", m === "auto" ? "light dark" : m);
}

export function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const now = get().settings.theme || "auto";
  const next = order[(order.indexOf(now) + 1) % order.length];
  setSetting("theme", next);
  applyTheme(next);
  return next;
}

/* ---------- misc formatting ---------- */

export function fmtDuration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  return `${hrs} h ${min % 60} min`;
}

export function toneClass(n) { return `t${n}`; }

/** Splits a pinyin string into syllables and wraps each in a tone-coloured span. */
export function pinyinTones(pinyin, toneOf) {
  const frag = document.createDocumentFragment();
  pinyin.split(/(\s+)/).forEach((part) => {
    if (!part.trim()) { frag.append(part); return; }
    frag.append(h("span", { class: `py ${toneClass(toneOf(part))}` }, part));
  });
  return frag;
}
