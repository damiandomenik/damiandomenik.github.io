/* state.js — the small amount of state that outlives a single view.
 *
 * Deliberately in memory only. The rule set is a policy, not a secret, but
 * keeping it out of localStorage means there is one less place a password could
 * accidentally end up if someone pastes one into the wrong field.
 */

import { DEFAULT_RULES } from './password/rules.js';

let rules = { ...DEFAULT_RULES };
const listeners = new Set();

export function sharedRules() {
  return { ...rules };
}

export function setSharedRules(next) {
  rules = { ...next };
  for (const listener of listeners) {
    try { listener(sharedRules()); } catch (err) { console.error(err); }
  }
}

export function onRulesChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A password handed from the generator to the analyzer.
 *
 * In memory, for exactly one read, and cleared as it is taken — the point of
 * the button is "analyse this one", and the alternative was a button that
 * silently opened an empty field.
 */
let handoff = null;

export function setHandoffPassword(value) {
  handoff = value || null;
}

export function takeHandoffPassword() {
  const value = handoff;
  handoff = null;
  return value;
}

/** Navigate between views without each view importing the router. */
export function goTo(route) {
  location.hash = `#/${route}`;
}
