import './style.css';
import { Game } from './game/Game';
import { DebugPanel } from './debug/DebugPanel';
import { now } from './core/MathUtils';

const viewport = document.getElementById('viewport');
const uiRoot = document.getElementById('ui-root');

if (!viewport || !uiRoot) {
  throw new Error('Arena Rumble could not find its mount points in index.html');
}

if (!('RTCPeerConnection' in window)) {
  uiRoot.innerHTML =
    '<div class="screen"><div class="result">' +
    '<div class="result__label">Unsupported browser</div>' +
    '<div class="result__sub">Arena Rumble needs WebRTC. Try Chrome, Edge, Firefox or Safari 15+.</div>' +
    '</div></div>';
} else {
  const game = new Game(viewport, uiRoot);
  game.start();

  if (DebugPanel.isEnabled()) {
    const panel = new DebugPanel(game);
    uiRoot.append(panel.root);

    let last = now();
    const tick = () => {
      const time = now();
      panel.update((time - last) / 1000);
      last = time;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Handy in the console while developing.
  (window as unknown as Record<string, unknown>).arenaRumble = game;
}
