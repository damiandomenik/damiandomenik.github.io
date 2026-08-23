import { CONFIG as C } from '../core/Config.js';
import { PlayerCharacter } from './PlayerCharacter.js';
import { GlbCharacter } from './GlbCharacter.js';
import { hasPlayerModel } from './ModelLibrary.js';

/**
 * Erzeugt die Spielerfigur — entweder das GLB-Modell aus dem Character Sheet
 * oder die prozedurale Variante. Beide bieten dieselbe Schnittstelle, das
 * Spiel behandelt sie identisch. Fällt das Modell aus (Datei fehlt, Ladefehler),
 * wird automatisch auf die prozedurale Figur zurückgefallen.
 */
export function createCharacter(opts) {
  if (C.CHARACTER_MODEL === 'glb' && hasPlayerModel()) {
    try { return new GlbCharacter(opts); }
    catch (e) { console.warn('[RiftRush] GLB-Figur fehlgeschlagen:', e.message); }
  }
  return new PlayerCharacter({ ...opts, build: C.CHARACTER_BUILD });
}
