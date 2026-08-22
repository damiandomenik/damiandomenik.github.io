import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');

function fatal(msg, detail) {
  const el = document.getElementById('overlay');
  if (el) {
    el.innerHTML = `<div class="screen"><h2>Start nicht möglich</h2>
      <p style="color:var(--dim);font-size:13px;line-height:1.7">${msg}</p>
      ${detail ? `<p style="color:var(--dim);font-size:11px;margin-top:12px;font-family:var(--mono)">${detail}</p>` : ''}</div>`;
    el.classList.remove('hidden');
  }
  console.error('[RiftRush]', msg, detail || '');
}

function boot() {
  if (!('RTCPeerConnection' in window)) {
    console.warn('[RiftRush] WebRTC nicht verfügbar — Multiplayer deaktiviert, Solo funktioniert.');
  }
  let game;
  try {
    game = new Game(canvas);
  } catch (err) {
    fatal('RiftRush braucht WebGL. Bitte einen aktuellen Browser verwenden und Hardware-Beschleunigung aktivieren.',
      String(err && err.message || err));
    return;
  }
  game.start();
  window.RIFTRUSH = game;   // Debug-Zugriff in der Konsole
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
