/* Chinese pronunciation through the browser's own speech synthesis.
   No external service. If no Chinese voice is installed we say so instead of
   playing something that would mispronounce every word. */

import { get } from "./state.js";

const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;
let voices = [];
const ready = new Set();

function refresh() {
  if (!synth) return;
  voices = synth.getVoices() || [];
  ready.forEach((fn) => fn());
}
if (synth) {
  refresh();
  synth.addEventListener?.("voiceschanged", refresh);
  setTimeout(refresh, 300);
}

export function onVoicesReady(fn) { ready.add(fn); return () => ready.delete(fn); }

export function chineseVoices() {
  return voices.filter((v) => /^zh|cmn|yue/i.test(v.lang.replace("_", "-")));
}

export function pickVoice() {
  const list = chineseVoices();
  if (!list.length) return null;
  const wanted = get().settings.voice;
  if (wanted) {
    const found = list.find((v) => v.voiceURI === wanted || v.name === wanted);
    if (found) return found;
  }
  return list.find((v) => /^zh-CN/i.test(v.lang)) || list.find((v) => /^zh/i.test(v.lang)) || list[0];
}

export function ttsAvailable() { return !!synth && chineseVoices().length > 0; }

export const TTS_UNAVAILABLE = "Chinese audio isn't available in this browser.";

let current = null;

export function speak(text, { rate } = {}) {
  if (!synth) return false;
  const voice = pickVoice();
  if (!voice) return false;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang || "zh-CN";
    u.rate = rate ?? get().settings.rate ?? 0.85;
    current = u;
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stop() {
  try { synth?.cancel(); } catch {}
  current = null;
}
