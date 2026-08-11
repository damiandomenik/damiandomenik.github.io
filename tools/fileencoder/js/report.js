/* report.js — the analysis card: what the file is, what fits, what to do.
 *
 * The capacity gauge is the centrepiece. It draws the payload against the four
 * real QR capacities, so "too large" is something you can see rather than
 * something the tool asserts.
 */

import { el, badge, stat, notice, formatBytes } from './ui.js';
import { iconFor } from './sniff.js';
import { ECC_LEVELS } from './qr.js';
import { base64Length, base64Overhead } from './encode.js';

const VERDICT_BADGE = {
  ready: ['ok', '🟢 QR ready'],
  possible: ['warn', '🟡 Possible, not recommended'],
  'too-large': ['bad', '🔴 Too large for QR'],
};

/** The file identity block: name, type, sizes. */
export function fileFacts(file) {
  const base64Size = base64Length(file.size);
  const overhead = base64Overhead(file.size);

  return el('div', { class: 'facts' },
    el('div', { class: 'facts-head' },
      el('span', { class: 'facts-icon', 'aria-hidden': 'true', text: iconFor(file.mime) }),
      el('div', { class: 'facts-title' },
        el('span', { class: 'facts-name', text: file.name }),
        el('span', { class: 'facts-type', text: file.label })
      )
    ),
    el('div', { class: 'stat-grid' },
      stat('MIME', file.mime, file.source === 'bytes' ? 'read from the file contents'
        : file.source === 'content' ? 'inferred from the text'
        : file.source === 'extension' ? 'from the extension only' : 'not recognised'),
      stat('Original', formatBytes(file.size), `${file.size.toLocaleString()} bytes`),
      stat('Base64', formatBytes(base64Size), `+${overhead.toFixed(1)}% overhead`),
    ),
    file.mismatch
      ? notice(`The contents look like ${file.label.toLowerCase()}, which does not match the file extension. What the bytes say is what counts.`, 'warn')
      : null
  );
}

/**
 * The gauge: payload length against the four real QR capacities.
 * Everything is drawn to scale against the absolute maximum of 2,953 bytes.
 */
export function qrGauge(qr) {
  const max = 2953;
  const ratio = Math.min(1, qr.payloadBytes / max);
  const overflow = qr.payloadBytes > max;

  const marks = ECC_LEVELS.map(level => el('div', {
    class: 'gauge-mark',
    style: `left:${(level.capacity / max) * 100}%`,
    title: `${level.level} — ${level.name} error correction, ${level.capacity} bytes`,
  }, el('span', { class: 'gauge-mark-label', text: level.level })));

  const [kind] = VERDICT_BADGE[qr.verdict];

  return el('div', { class: 'gauge', dataset: { verdict: qr.verdict } },
    el('div', { class: 'gauge-head' },
      el('span', { class: 'gauge-title', text: 'QR capacity' }),
      badge(VERDICT_BADGE[qr.verdict][1], kind)
    ),
    el('div', { class: 'gauge-track' },
      el('div', { class: 'gauge-fill', style: `width:${ratio * 100}%` }),
      ...marks
    ),
    el('div', { class: 'gauge-scale' },
      el('span', { text: '0' }),
      el('span', { text: `${max} bytes — the largest QR code there is` })
    ),
    el('p', { class: 'gauge-reason', text: qr.reason }),
    overflow
      ? el('p', { class: 'gauge-note', text:
          `Your payload is ${formatBytes(qr.payloadBytes)}; the bar above stops at the maximum.` })
      : null,
    el('div', { class: 'levels' },
      ...qr.levels.map(level => el('div', { class: 'level', dataset: { fits: String(level.fits), comfortable: String(level.comfortable) } },
        el('span', { class: 'level-name', text: `${level.level} · ${level.name}` }),
        el('span', { class: 'level-cap', text: `${level.capacity} B` }),
        el('span', { class: 'level-verdict', text: level.fits
          ? (level.comfortable ? `fits, version ${level.version}` : `version ${level.version} — very dense`)
          : 'does not fit' }),
        el('span', { class: 'level-recovers', text: level.recovers })
      ))
    )
  );
}

/** The "what makes sense" block. */
export function adviceCard(advice) {
  return el('div', { class: 'advice' },
    el('h3', { class: 'advice-title', text: 'What makes sense?' }),
    el('div', { class: 'advice-list' },
      ...advice.options.map(option => el('div', { class: 'advice-row', dataset: { state: option.ok ? (option.warn ? 'warn' : 'ok') : 'bad' } },
        el('span', { class: 'advice-mark', 'aria-hidden': 'true', text: option.ok ? (option.warn ? '!' : '✓') : '✗' }),
        el('div', { class: 'advice-body' },
          el('span', { class: 'advice-name', text: option.title }),
          el('span', { class: 'advice-text', text: option.text })
        )
      ))
    ),
    el('div', { class: 'advice-recommend' },
      el('span', { class: 'advice-recommend-label', text: 'Recommended' }),
      el('span', { class: 'advice-recommend-text', text: advice.recommendation })
    ),
    ...advice.warnings.map(text => notice(text, 'warn'))
  );
}
