/* ui.js — DOM helpers shared by every view.
 *
 * No innerHTML anywhere: patterns, passwords and test text are all user input,
 * and the regex playground literally exists to paste strange text into.
 */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const $ = id => document.getElementById(id);

/* ---------------- toasts ---------------- */

export function toast(message, kind = 'info', ms = 2400) {
  const node = el('div', { class: 'toast', dataset: { kind }, role: 'status', text: message });
  $('toasts').append(node);
  setTimeout(() => {
    node.dataset.leaving = 'true';
    setTimeout(() => node.remove(), 200);
  }, ms);
}

export async function copyText(text, label = 'Copied!') {
  if (!text) { toast('Nothing to copy', 'warn'); return; }
  try {
    await navigator.clipboard.writeText(text);
    toast(label, 'ok');
  } catch {
    // Clipboard access can be refused; a selectable fallback beats a dead button.
    const area = el('textarea', { class: 'copy-fallback' });
    area.value = text;
    document.body.append(area);
    area.select();
    const worked = document.execCommand?.('copy');
    area.remove();
    toast(worked ? label : 'Your browser blocked copying — select the text manually.', worked ? 'ok' : 'warn', 4000);
  }
}

/* ---------------- building blocks ---------------- */

export function section(title, subtitle, ...content) {
  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', { class: 'card-title', text: title }),
      subtitle ? el('p', { class: 'card-sub', text: subtitle }) : null
    ),
    ...content
  );
}

export function field(label, control, hint) {
  return el('label', { class: 'field' },
    el('span', { class: 'field-label', text: label }),
    control,
    hint ? el('span', { class: 'field-hint', text: hint }) : null
  );
}

export function button(label, { kind = '', onclick, title, disabled } = {}) {
  return el('button', {
    class: `btn ${kind}`.trim(),
    onclick,
    title,
    disabled: disabled || false,
    type: 'button',
  }, label);
}

/** A code block with a copy button. `getValue` keeps it live. */
export function codeBlock(getValue, { label = 'Copy' } = {}) {
  const code = el('code', { class: 'code-text' });
  const copy = button(label, { kind: 'ghost small', onclick: () => copyText(code.textContent) });
  const node = el('div', { class: 'code-block' },
    el('pre', { class: 'code-pre' }, code),
    el('div', { class: 'code-actions' }, copy)
  );
  const update = () => { code.textContent = getValue() ?? ''; };
  update();
  return { node, update, get value() { return code.textContent; } };
}

export function checkbox(label, checked, onChange, hint) {
  const input = el('input', { type: 'checkbox' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  return {
    node: el('label', { class: 'check' }, input,
      el('span', {}, label),
      hint ? el('span', { class: 'check-hint', text: hint }) : null),
    input,
  };
}

export function numberInput(value, { min = 0, max = 128, onChange, width = '5rem', ariaLabel } = {}) {
  const input = el('input', {
    type: 'number', min, max, class: 'input number', style: `width:${width}`,
    'aria-label': ariaLabel,
  });
  input.value = String(value);
  input.addEventListener('input', () => {
    const parsed = Number(input.value);
    onChange(Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min);
  });
  return input;
}

/** Strength meter: five segments plus a label. */
export function meter() {
  const bars = Array.from({ length: 5 }, () => el('span', { class: 'meter-bar' }));
  const label = el('span', { class: 'meter-label' });
  const detail = el('span', { class: 'meter-detail' });
  const node = el('div', { class: 'meter' },
    el('div', { class: 'meter-bars' }, ...bars),
    el('div', { class: 'meter-text' }, label, detail)
  );
  return {
    node,
    set(score, text, detailText = '') {
      bars.forEach((bar, index) => {
        bar.dataset.on = String(index <= score);
        bar.dataset.score = String(score);
      });
      label.textContent = text;
      label.dataset.score = String(score);
      detail.textContent = detailText;
    },
  };
}

/** ✓ / ✗ rows used by the analyzer and the rule tester. */
export function checkList() {
  const list = el('ul', { class: 'checklist' });
  return {
    node: list,
    set(items) {
      list.replaceChildren(...items.map(item => el('li', { class: 'checkrow', dataset: { ok: String(item.ok) } },
        el('span', { class: 'checkmark', 'aria-hidden': 'true', text: item.ok ? '✓' : '✗' }),
        el('span', { class: 'checklabel', text: item.label }),
        item.detail ? el('span', { class: 'checkdetail', text: item.detail }) : null
      )));
    },
  };
}

export function notice(text, kind = 'info') {
  return el('p', { class: 'notice', dataset: { kind }, text });
}

export function empty(text) {
  return el('p', { class: 'empty', text });
}

/** Debounce for live inputs that do real work on every keystroke. */
export function debounce(fn, ms = 90) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
