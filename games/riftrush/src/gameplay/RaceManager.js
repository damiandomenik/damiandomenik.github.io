/**
 * Verwaltet Zeiten, Fortschritt und Platzierungen aller Spieler.
 * Sortierung: 1) beendet (schnellste Zeit) 2) höchster Checkpoint 3) weiteste Z-Position
 */
export class RaceManager {
  constructor(game) {
    this.game = game;
    this.entries = new Map();   // id -> entry
  }

  reset(players) {
    this.entries.clear();
    for (const p of players) this.add(p);
  }

  add({ id, name, color, self = false }) {
    this.entries.set(id, {
      id, name, color, self,
      checkpoint: 0, z: 0, finished: false, time: null,
      deaths: 0, place: 0,
    });
  }

  remove(id) { this.entries.delete(id); }
  get(id) { return this.entries.get(id); }

  updateLocal(player, elapsedMs) {
    const e = this.entries.get(player.id);
    if (!e) return;
    e.checkpoint = player.checkpoint;
    e.z = player.state.pos.z;
    e.deaths = player.deaths;
    if (player.finished && !e.finished) {
      e.finished = true;
      e.time = elapsedMs;
    }
  }

  updateRemote(rp) {
    const e = this.entries.get(rp.id);
    if (!e) return;
    e.checkpoint = rp.checkpoint;
    e.z = rp.render.z;
    if (rp.finished && !e.finished) e.finished = true;
  }

  setFinish(id, timeMs) {
    const e = this.entries.get(id);
    if (!e) return;
    e.finished = true;
    e.time = timeMs;
  }

  standings() {
    const list = [...this.entries.values()];
    list.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return (a.time ?? 1e12) - (b.time ?? 1e12);
      if (a.checkpoint !== b.checkpoint) return b.checkpoint - a.checkpoint;
      return a.z - b.z;
    });
    list.forEach((e, i) => (e.place = i + 1));
    return list;
  }

  get allFinished() {
    const list = [...this.entries.values()];
    return list.length > 0 && list.every((e) => e.finished);
  }
}
