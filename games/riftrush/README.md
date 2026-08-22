# RiftRush

**Competitive Multiplayer Parkour Dungeon Racer** — Three.js + WebRTC, komplett statisch.

Kein Build-Step, kein Bundler, keine externen Assets. `index.html` öffnen (über einen
Webserver) und los. three.js liegt lokal unter `vendor/` und wird per Import-Map geladen.

---

## 1. Lokal starten

```bash
# im Projektordner
python3 -m http.server 8000
#   oder
npx serve .
```

Dann `http://localhost:8000/` öffnen. (Direkt per `file://` funktioniert es **nicht**,
weil ES-Module CORS benötigen.)

---

## 2. Deployment auf GitHub Pages (`/games/riftrush/`)

Alle Pfade sind **relativ** (`./src/...`, `./vendor/...`), das Spiel läuft daher unter
jedem Subpath ohne Anpassung.

1. Diesen Ordner in das Repo `damiandomenik.github.io` kopieren als:

```
damiandomenik.github.io/
├── .nojekyll          <-- wichtig, im Repo-Root anlegen (leere Datei)
└── games/
    └── riftrush/
        ├── index.html
        ├── styles.css
        ├── vendor/
        ├── src/
        └── server/    (optional, wird von Pages ignoriert)
```

2. Commit + Push → erreichbar unter
   `https://damiandomenik.github.io/games/riftrush/`

**Ist `.nojekyll` Pflicht?** Nein — für dieses Projekt läuft es auch ohne. GitHub Pages
schickt beim Deploy aus einem Branch alles durch Jekyll. Jekyll ignoriert dabei Dateien
und Ordner, die mit `_` oder `.` beginnen; RiftRush hat keine solchen Pfade, deshalb
passiert ohne die Datei nichts Schlimmes. Nachteile ohne `.nojekyll`:

* jeder Push läuft durch einen unnötigen Jekyll-Build (etwas langsamer, kann theoretisch
  fehlschlagen und damit das Deployment blockieren),
* sobald du später etwas wie `_assets/` oder `_next/` hinzufügst, liefert Pages dafür 404,
* Dateien mit YAML-Front-Matter würden als Templates verarbeitet.

Sie muss im **Repo-Root** liegen, weil sie ein Schalter für den gesamten Pages-Build ist,
nicht für einzelne Unterordner. Kostet nichts, verhindert Überraschungen — deshalb die
Empfehlung, sie anzulegen. (Wer Pages über GitHub Actions deployt, braucht sie gar nicht:
dort läuft ohnehin kein Jekyll.)

---

## 3. Multiplayer einrichten

WebRTC braucht einen Signaling-Kanal für den SDP/ICE-Austausch. Es gibt zwei Wege:

### A) Manueller Modus (0 Backend, ideal für den ersten Test)

Im Menü das Feld „Signaling Server" **leer lassen**.

1. Spieler 1 klickt **Lobby erstellen** → es erscheint ein langer Code (Offer).
2. Diesen Code an Spieler 2 schicken (Discord, WhatsApp …).
3. Spieler 2 klickt **Beitreten** (Code-Feld beliebig), fügt den Blob unten ein → **Verbinden**.
4. Spieler 2 erhält einen Antwort-Code → zurück an Spieler 1 → dort einfügen → **Verbinden**.
5. Verbindung steht (P2P-Anzeige oben links). Host startet das Match.

Limitierung: genau 2 Spieler.

### B) WebSocket-Signaling-Server (bis 8 Spieler, Room Codes)

```bash
cd server
npm install
npm start          # ws://localhost:8080
```

Im Menü unter „Verbindungs-Einstellungen" die URL eintragen, z. B.
`ws://localhost:8080` (lokal) oder `wss://dein-server.example` (Produktion).

> Wichtig: Die GitHub-Pages-Seite läuft über HTTPS. Browser erlauben von dort aus **nur
> `wss://`** — der Server braucht also ein TLS-Zertifikat (Render / Railway / Fly.io /
> Caddy-Reverse-Proxy liefern das automatisch).

Der Server vermittelt ausschließlich die Verbindung. Das Gameplay läuft danach
vollständig Peer-to-Peer.

---

## 4. Tests

```bash
npm install     # nur Test-Abhängigkeiten (jsdom, ws) — für das Spiel selbst nicht nötig
npm test
```

Ohne `npm install` läuft `node tests/run.mjs` ebenfalls, überspringt dann aber die
Multiplayer- und E2E-Suite. Der Runner legt sich `node_modules/three` automatisch aus
`vendor/` an.

Abgedeckt:

* **Struktur** (30 Seeds): jeder Room hat Boden am Eingang, keine versiegelten Ausgänge,
  Checkpoint-Reihenfolge, genau ein Finish-Trigger, kein Room-Typ doppelt hintereinander,
  Abstieg pro Room bleibt über der Kill-Plane
* **Movement**: Slide-Boost & -Ende, Double Jump, Wallrun-Start, Walljump-Impuls,
  Dash-Cooldown, keine NaN
* **Determinismus**: gleicher Seed erzeugt exakt dieselbe Geometrie
* **Netzwerk**: Snapshot-Interpolation bei 12 % Paketverlust und ±20 ms Jitter
  (keine harten Positionssprünge), Leaderboard-Sortierung
* **Multiplayer** (echter Signaling-Server aus `/server` + Loopback-PeerConnections):
  Verbindungsaufbau, Roster- und Profilabgleich, Ready-Status, Seed-Verteilung,
  Snapshot-Tickrate, gerichtete Treffer-Events, Full Mesh mit 3 Peers, Broadcast,
  sauberes Leave (genau ein Event), Verhalten bei Paketverlust, Reconnect sowie der
  komplette manuelle Copy-&-Paste-Modus
* **End-to-End** (jsdom): Menü → Solo-Lobby → Countdown → Bewegung → Pause/Resume →
  Ziel → Ergebnisse → Rematch → Verlassen, inklusive Speicherprüfung bei
  mehrfacher Dungeon-Generierung

---

## 5. Steuerung

| Taste | Aktion |
|---|---|
| `W A S D` | Bewegung |
| `SHIFT` | Sprint |
| `SHIFT SHIFT` (Doppeltipp), `Q` oder `RMB` | Dash |
| `SPACE` | Jump / Double Jump / Walljump |
| `STRG` / `C` | Crouch, im Lauf → Slide |
| Wand anlaufen (in der Luft, mit Speed) | Wallrun |
| `LMB` / `F` | Punch (Knockback) |
| `R` | Respawn am letzten Checkpoint |
| `ESC` | Pause |

Desktop only — Touch-Steuerung gibt es (noch) nicht, Tastatur und Maus sind erforderlich.

Kombo-Beispiel: `Sprint → Jump → Wallrun → Walljump → Dash → Slide → Jump`.

---

## 6. Architektur

```
src/
  core/
    Config.js          alle Movement-/Netzwerk-Werte zentral (window.RIFT_CONFIG)
    Game.js            Scene, Loop, Verdrahtung aller Systeme
    GameState.js       Match-Phasen (MENU → LOBBY → COUNTDOWN → RUNNING → RESULTS)
    Input.js           Keyboard/Maus + Pointer Lock
    Physics.js         AABB-Welt, Spatial Hash, Player-Sweep, Raycast
    Utils.js           Seeded RNG, Zeitformat, Lerp/Damp

  player/
    Player.js          LocalPlayer + Avatar (Capsule, Nameplate, State-Posing)
    PlayerMovement.js  komplettes Parkour-Movement (Sprint/Slide/Wallrun/Dash …)
    PlayerController.js Third-Person-Kamera (Collision, dynamisches FOV) + Command
    PlayerAbilities.js modulares Ability-System (Punch; erweiterbar)

  multiplayer/
    SignalingManager.js  Interface + WebSocket- und Manual-Implementierung
    WebRTCManager.js     PeerConnections, 2 DataChannels (unreliable/reliable)
    NetworkManager.js    Protokoll: profile | ready | start | event | s(napshot)
    RemotePlayer.js      Snapshot-Interpolation (+ kurze Extrapolation)

  dungeon/
    RoomRegistry.js     15 Room-Typen (Parkour, Vertical, Trap, Split, Switch,
                        Moving, Chase, PvP, Speed, Descent, Final, Finish …)
    DungeonRoom.js      Builder-API für Rooms (box/plat/hazard/moving/blinker/door)
    DungeonGenerator.js Seed → Route → InstancedMeshes + Collider
    Checkpoint.js       Respawn-Punkte
    Hazards.js          Materialien & dynamische Meshes

  gameplay/
    MatchManager.js    Flow, Countdown, Ergebnisermittlung
    RaceManager.js     Zeiten, Fortschritt, Platzierungen
    AbilityManager.js  Einstiegspunkt der Ability-Registry

  ui/
    HUD.js, LobbyUI.js, ResultsUI.js
```

### Netzwerk-Design

* **Snapshots** (Position, Rotation, Velocity, Movement-State, Checkpoint) gehen mit
  fester Tickrate (`NET_TICK_RATE = 20 Hz`) über einen **unreliable/unordered**
  DataChannel — nicht pro Frame.
* Remote-Spieler werden mit `NET_INTERP_DELAY = 120 ms` **interpoliert**; bei
  Paketverlust wird max. 250 ms extrapoliert → keine Ruckler trotz Jitter.
* **Events** (Checkpoint, Schalter, Treffer, Finish) laufen über den **reliable**
  Channel.
* **Autorität**: Host bestimmt Seed + Matchstart; jeder Client besitzt sein eigenes
  Movement; Knockback wird vom getroffenen Client angewendet. Die Trennung
  `Signaling ↔ WebRTC ↔ Protokoll` erlaubt es, später einen autoritativen Server
  einzusetzen, ohne Gameplay-Code anzufassen.
* Voller Mesh bis 8 Spieler.

### Performance

* Statische Level-Geometrie als **InstancedMesh pro Material** → wenige Draw Calls.
* Kollision über **AABB + Spatial Hash**, keine Physik-Engine.
* Keine Objekt-Erzeugung im Frame-Loop (wiederverwendete Scratch-Arrays/Vektoren).
* Ziel: 60 FPS auf normalen Desktops.

---

## 7. Tuning

Alle Movement-Werte live in der Browser-Konsole ändern:

```js
RIFT_CONFIG.SPRINT_SPEED = 18;
RIFT_CONFIG.DASH_FORCE   = 45;
RIFT_CONFIG.GRAVITY      = 26;
RIFT_CONFIG.ROOM_COUNT   = 12;   // längerer Dungeon beim nächsten Match
```

Debug-Zugriff auf das Spiel: `window.RIFTRUSH`.

---

## 8. Status / Roadmap

Umgesetzt (Phase 1–5): Movement, Kamera, Dungeon-Generierung mit Seed, Checkpoints,
Race-Timer, Leaderboard, WebRTC-Multiplayer, Lobby + Room Code, Countdown, Punch/
Knockback, Hazards, Results, Rematch.

Bewusste Design-Entscheidungen (keine Bugs):

* **Kein Cheat-Schutz.** Knockback wird vom getroffenen Client angewendet, Zeiten meldet
  jeder Client selbst. Für ein Rennen unter Freunden reicht das; für Rankings braucht es
  den autoritativen Server.
* **Countdown ist client-lokal.** Es gibt keine Uhren-Synchronisation, die Startzeiten
  können um die Signaling-Latenz (typisch < 100 ms) auseinanderliegen.
* **Chase-Hazard ist lokal.** Die verfolgende Wand im `chase_room` läuft pro Client;
  andere Spieler sehen deine Wand nicht.
* **Host-Migration ist minimal.** Verlässt der Host, übernimmt der verbleibende Spieler
  mit der kleinsten ID. Ein laufendes Match läuft dabei normal weiter.
* **Späteinsteiger** werden vom Host automatisch in ein laufendes Match geholt
  (ohne Countdown, mit der bereits verstrichenen Zeit).

Nächste Schritte:
* Ghost des besten Runs (lokal via `localStorage`)
* Shockwave- und Trap-Ability (Registry steht bereits)
* Autoritativer Server statt Host-Autorität
* Sound, Partikel, weitere Room-Module
