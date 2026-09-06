/* App shell and router. Hash routing keeps it a plain static page. */

import * as S from "./state.js";
import { runSession } from "./session.js";
import { renderWriter } from "./writer.js";
import * as V from "./views.js";
import { h, clear, $, applyTheme, cycleTheme, achievementPopup, toast } from "./ui.js";

const ROUTES = [
  { hash: "#/", zh: "首", label: "Overview", render: (host, ctx) => V.overview(host, ctx) },
  { hash: "#/learn", zh: "学", label: "Learn", render: (host, ctx) => V.learn(host, ctx) },
  { hash: "#/review", zh: "复", label: "Review", render: (host, ctx) => V.review(host, ctx) },
  { hash: "#/vocab", zh: "词", label: "Words", render: (host, ctx) => V.vocabulary(host, ctx) },
  { hash: "#/hsk", zh: "级", label: "HSK", render: (host, ctx) => V.hsk(host, ctx) },
  { hash: "#/rules", zh: "规", label: "Rules", render: (host, ctx) => V.rules(host, ctx) },
  { hash: "#/progress", zh: "进", label: "Progress", render: (host, ctx) => V.progress(host, ctx) }
];

const view = $("#view");
const navHosts = [$("#nav"), $("#mobile-nav")].filter(Boolean);
const xpValue = $("#xp-value");
const streakValue = $("#streak-value");

let pendingSession = null;
let cleanup = null;

const ctx = {
  go(hash) { location.hash = hash; },
  start(session) { pendingSession = session; location.hash = "#/session"; }
};

function buildNav() {
  navHosts.forEach((host) => {
    ROUTES.forEach((r) => {
      host.append(h("a", { href: r.hash, class: "nav-item", "data-hash": r.hash },
        h("span", { class: "nav-zh", lang: "zh-CN", "aria-hidden": "true" }, r.zh),
        h("span", { class: "nav-label" }, r.label)));
    });
  });
}

function markNav(hash) {
  navHosts.forEach((host) => {
    [...host.children].forEach((a) => {
      const on = a.dataset.hash === hash;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  });
}

function syncHeader() {
  const streak = S.streakDisplay();
  xpValue.textContent = S.get().xp;
  streakValue.textContent = streak;
  streakValue.parentElement.classList.toggle("cold", streak === 0);
  document.body.classList.toggle("in-session", location.hash === "#/session");
}

function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const hash = location.hash || "#/";
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  if (hash === "#/session") {
    if (!pendingSession) { location.replace("#/"); return; }
    const session = pendingSession;
    markNav("");
    clear(view);
    document.title = `${session.title} · Chinese Lab`;
    runSession(session, view, {
      onExit: () => { pendingSession = null; location.hash = "#/"; }
    });
    syncHeader();
    return;
  }

  if (hash === "#/write") {
    markNav("#/learn");
    clear(view);
    document.title = "Character practice · Chinese Lab";
    cleanup = renderWriter(view, { level: V.currentLevel() });
    syncHeader();
    return;
  }

  const r = ROUTES.find((x) => x.hash === hash) || ROUTES[0];
  markNav(r.hash);
  clear(view);
  document.title = `${r.label} · Chinese Lab — HSK 1–3`;
  r.render(view, ctx);
  syncHeader();
}

function init() {
  applyTheme();
  buildNav();

  $("#theme-toggle").addEventListener("click", () => {
    const next = cycleTheme();
    toast(next === "auto" ? "Following your system theme" : next === "light" ? "Light mode" : "Dark mode");
  });

  S.subscribe((_, detail) => {
    syncHeader();
    if (detail.unlocked?.length) achievementPopup(detail.unlocked);
  });

  window.addEventListener("hashchange", route);

  // Keep the streak honest across midnight without waiting for a click.
  S.daily();
  route();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && location.hash === "#/session") {
      pendingSession = null;
      location.hash = "#/";
    }
  });
}

init();
