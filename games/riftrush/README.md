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

### B) WebSocket-Signaling-Server (bis 8 Spieler, Lobby-Liste + Room Codes)

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

Mit Server gibt es im Menü eine **Liste offener Lobbys**: wer eine Lobby erstellt,
taucht bei allen anderen automatisch auf — Hostname, Spielerzahl und ob das Match
schon läuft. Ein Klick genügt, der Code ist dann optional. Die Liste aktualisiert
sich von selbst (der Server pusht bei jeder Änderung), es gibt zusätzlich
`GET /lobbies` als einfachen JSON-Endpunkt.

Ohne Server ist das technisch nicht möglich: WebRTC ist reines Peer-to-Peer und
kennt nur Gegenstellen, die man bereits kennt. Es braucht immer eine Stelle, die
weiß, wer gerade offen ist — genau das ist der Signaling-Server. Im manuellen Modus
bleibt daher nur der Code-Austausch.

Der Server vermittelt ausschließlich Verbindungsaufbau und Lobby-Liste. Das Gameplay
läuft danach vollständig Peer-to-Peer.

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
* **Checkpoint-Sicherheit**: 12 s Weltsimulation pro Seed — kein Hazard (auch kein
  bewegter) darf je einen Respawn-Punkt berühren, sonst entsteht eine Todesschleife
* **Z-Fighting**: keine überlappenden Boxen mit exakt gleicher Oberkante
* **Movement**: Slide-Boost & -Ende, Double Jump, Wallrun-Start (nur an markierten
  Wänden), Walljump-Impuls, keine NaN
* **Bewegungsbudget**: gemessene Reichweiten pro Technik, Abstufung zwischen ihnen,
  Level-Lücken im Verhältnis zur Reichweite (erreichbar, aber nicht geschenkt),
  Dash lädt nachweislich nicht in der Luft nach
* **Determinismus**: gleicher Seed erzeugt exakt dieselbe Geometrie
* **Netzwerk**: Snapshot-Interpolation bei 12 % Paketverlust und ±20 ms Jitter
  (keine harten Positionssprünge), Leaderboard-Sortierung
* **Multiplayer** (echter Signaling-Server aus `/server` + Loopback-PeerConnections):
  Verbindungsaufbau, Roster- und Profilabgleich, Ready-Status, Seed-Verteilung,
  Snapshot-Tickrate, gerichtete Treffer-Events, Full Mesh mit 3 Peers, Broadcast,
  sauberes Leave (genau ein Event), Verhalten bei Paketverlust, Reconnect, der
  Lobby-Browser (Lobby erscheint und verschwindet automatisch, Status „läuft",
  Spielerzahl, Verhalten ohne Server) sowie der komplette manuelle Copy-&-Paste-Modus
* **Spielerfigur**: Aufbau und Teilezahl, Proportionen und Beinlänge für alle drei
  Statur-Presets, Animation über alle zehn Bewegungszustände (keine NaN, Gliedmaßen
  bewegen sich wirklich), Handpositionen im Weltraum (Arme dürfen nie durch den Torso
  drehen), Blickrichtung und Greifarm beim Wallrun für beide Seiten,
  sichtbarer Schlag, Farbsystem, Partikel-Pool inkl. Überlauf, Namensschild-Skalierung
* **Wallrun-Regeln**: nur markierte Wände erlauben Wallrun, unmarkierte nicht, und die
  Wallrun-Räume sind für einen Geradeaus-Bot nachweislich nicht passierbar
* **Erreichbarkeit**: 153 Raumdurchläufe über 12 Seeds — jede Plattform muss innerhalb
  der Sprung-Hüllkurve (2,07 m einfach, ~3,8 m mit Doppelsprung, jeweils mit Reserve)
  vom Eingang aus erreichbar sein. Fängt genau die „gerade so eben"-Sprünge ab.
* **Laufrichtung**: der Körper zeigt bei Strafe und Rückwärtslauf wirklich in die
  Bewegungsrichtung (geprüft über den Weltvektor, nicht über Winkelkonventionen),
  der Kopf hält dagegen, im Stand richtet sich die Figur wieder aus und der Drehwinkel
  summiert sich über viele Richtungswechsel nicht auf
* **Boss-Führung**: Wegweiser zeigt in jeder Phase auf das richtige Ziel und wandert
  nach erledigtem Mechanismus weiter; nach Ablauf des Countdowns greift der Kollaps,
  ohne den Fluchtweg zu zerstören
* **Boss**: Arena in jeder Route korrekt eingebettet, Mechanismen erhöht und Kern hoch
  genug (Parkour zwingend), Phasenfolge 1→2→3, Kern erst in Phase 2 treffbar, Einsturz
  lässt immer einen Weg zum Ausgang, Angriffe treffen am Boden und verfehlen beim Sprung,
  Vorwarnzeiten, keine Treffer-Dauerschleife (9 Treffer in 60 s bei Untätigkeit),
  Host/Client-Synchronisation inkl. Späteinsteiger und Traffic-Budget, Zeitbonus,
  Modellbudget (33 Meshes, 1.184 Dreiecke, ein Licht)
* **Grafik**: Vertex-Farb-Attribute vorhanden (sonst schwarze Flächen), Glow-Materialien
  ohne Tone Mapping, Streuung der Instanzfarben in sinnvollen Grenzen, Himmel/Sterne/Gitter
  vorhanden, ohne Nebel und kameragebunden, Draw-Call-Budget des Dungeons
* **Kamera**: Figur bleibt beim Strafen in der Bildmitte
* **Kamera**: kein Roll/Überschlag bei beliebigen Yaw-/Pitch-Kombinationen
* **End-to-End** (jsdom): Menü → Solo-Lobby → Countdown → Bewegung → Pause/Resume →
  Ziel → Ergebnisse → Rematch → Verlassen, inklusive Speicherprüfung bei
  mehrfacher Dungeon-Generierung

---

## 5. Steuerung

| Taste | Aktion |
|---|---|
| `W A S D` | Bewegung |
| `SHIFT` | Sprint |
| `RMB` oder `Q` | Dash |
| `SPACE` | Jump / Double Jump / Walljump |
| `STRG` / `C` | Crouch, im Lauf → Slide |
| **Violett markierte** Wand anlaufen (in der Luft, mit Speed) | Wallrun |
| `LMB` / `F` | Punch (Knockback) |
| `R` | Respawn am letzten Checkpoint |
| `ESC` | Pause |

Desktop only — Touch-Steuerung gibt es (noch) nicht, Tastatur und Maus sind erforderlich.

Kombo-Beispiel: `Sprint → Jump → Wallrun → Walljump → Dash → Slide → Jump`.

**Bewegung ist ein Budget, kein Dauerangebot.** Reichweiten über eine Lücke:

| Technik | Weite |
|---|---|
| Gehen | 6,4 m |
| Sprint-Sprung | 8,9 m |
| + Doppelsprung | 12,7 m |
| + Dash | 18,2 m |

Die grössten Lücken im Level liegen bei 6,7 m — also 75 % der Sprint-Reichweite.
Ein sauberer Anlauf ist Pflicht, Doppelsprung ist die Sicherheit, der Dash die
Abkürzung. Entscheidend: **der Dash lädt nur bei Bodenkontakt oder im Wallrun nach**
(2,2 s) und hebt einen nicht mehr an. Wer in der Luft dasht, ist festgelegt, bis er
wieder etwas berührt — Wandkontakt gibt Sprung und Dash sofort zurück und macht
Wallrun damit zur eigentlichen Fortbewegung statt zur Zierde.

**Wallrun geht nur an markierten Wänden.** Sie sind violett und haben waagerechte
Leuchtstreifen. Dafür ist er dort auch zwingend nötig: die Räume `Wallrun Corridor`
und `Rift Span` bestehen aus Abgründen, die man ohne Wallrun nicht überquert — im
`Rift Span` liegen die Zwischentritte links und rechts versetzt, man muss also die
Seite wechseln. An allen anderen Wänden klebt man nicht fest.

Die Kamera ist starr an der Figur verankert (WoW-Stil): sie bleibt immer in der
Bildmitte, auch beim Strafen und bei Richtungswechseln. Nur die Höhe wird geglättet.

Die Figur dreht sich in die **tatsächliche Laufrichtung** — mit `A`/`D` läuft sie also
seitwärts und nicht mit vorwärts stampfenden Beinen. Kopf und Brust halten dagegen
(bis maximal ~72°), sodass der Blick weiterhin dorthin geht, wo die Kamera hinzeigt:

| Eingabe | Körper | Kopf |
|---|---|---|
| `W` | 0° | 0° |
| `W`+`D` | 45° | 17° |
| `D` | 90° | 45° |
| `S` | 180° | 134° |

Bei einem Schlag dreht der Körper kurz zur Front zurück, damit die Faust in die
Blickrichtung geht.

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
    Player.js          LocalPlayer: Movement, Race-Fortschritt, Interaktionen
    PlayerCharacter.js Spielerfigur (Low-Poly-Sci-Fi, prozedurale Animation)
    PlayerColors.js    Farbpalette + Ableitung von Anzug/Visor/Kern
    CharacterFx.js     gemeinsames Partikelsystem (Dash, Funken, Landung)
    PlayerMovement.js  komplettes Parkour-Movement (Sprint/Slide/Wallrun/Dash …)
    PlayerController.js Third-Person-Kamera (Collision, dynamisches FOV) + Command
    PlayerAbilities.js modulares Ability-System (Punch; erweiterbar)

  multiplayer/
    SignalingManager.js  Interface + WebSocket- und Manual-Implementierung
    WebRTCManager.js     PeerConnections, 2 DataChannels (unreliable/reliable)
    NetworkManager.js    Protokoll: profile | ready | start | event | s(napshot)
    LobbyBrowser.js      Liste offener Lobbys (eigene, kurzlebige Verbindung)
    RemotePlayer.js      Snapshot-Interpolation (+ kurze Extrapolation)

  dungeon/
    RoomRegistry.js     15 Room-Typen (Parkour, Vertical, Trap, Split, Switch,
                        Moving, Chase, PvP, Speed, Descent, Final, Finish …)
    DungeonRoom.js      Builder-API für Rooms (box/plat/hazard/moving/blinker/door)
    DungeonGenerator.js Seed → Route → InstancedMeshes + Collider
    Checkpoint.js       Respawn-Punkte
    Hazards.js          Materialien & dynamische Meshes

  boss/
    BossArena.js       Arena-Geometrie (Kacheln, Mechanismen, Kern-Route, Tür)
    BossModel.js       prozedurales Boss-Modell "Rift Guardian"
    BossFight.js       Phasen, Angriffe, Treffererkennung, Synchronisation

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

### Spielerfigur

`PlayerCharacter` ist rein visuell und kennt weder Netzwerk noch Physik — sie bekommt
nur einen Bewegungszustand und interpretiert ihn selbst:

```js
character.updateAnimation(dt, {
  movementState: 'wallrun',   // idle|run|sprint|crouch|slide|jump|fall|wallrun|dash
  speed, isGrounded, isWallRunning, isDashing, wallSide, velocityY,
}, camera);
```

Statur umschaltbar über drei Presets — `runner` (kräftig, gedrungen, Standard),
`agile` (schlanker, kaum Panzerung) und `heavy` (massiver Exo-Anzug). Die Beine
machen bei allen unter 50 % der Körperhöhe aus, damit die Proportionen nicht
staksig wirken:

```js
RIFTRUSH.setBuild('heavy');      // wirkt sofort, auch für alle Mitspieler-Figuren
RIFT_CONFIG.CHARACTER_BUILD = 'agile';   // Standard für neue Figuren
```

Ein Bodenring unter der Figur ist standardmäßig **aus** (`RIFT_CONFIG.GROUND_RING = true`
schaltet ihn ein), ebenso gibt es kein Fadenkreuz.

Aufbau aus ~33 Primitiven (Capsule, Icosahedron, Box, Cylinder, eigene BufferGeometry
für den segmentierten Bodenring), ca. 1.570 Dreiecke, Körperhöhe ~1,71 m — passend zur
Hitbox. Animation ist komplett prozedural: Laufzyklus für Arme, Beine und Torso,
Vorlage beim Sprint, gestreckte Pose beim Dash, Atmen im Idle. Beim Wallrun neigt sich
der Körper zur Wand, dreht sich aber von ihr **weg**, sodass der Blick nach vorne geht,
während der wandseitige Arm danach greift. Der Punch ist eine sichtbare Schlaganimation
(Faust nach vorn, Gegenarm zurück, Körperdrehung) — auch bei allen Mitspielern. Effekte (Dash-Trail, Wallrun-Funken, Lande- und Sprungstaub, Punch)
laufen über ein einziges InstancedMesh für alle Spieler.

Remote-Spieler nutzen exakt dasselbe Modell — nur Farbe und Name unterscheiden sich,
damit im Rennen sofort lesbar ist, was die anderen gerade tun. Farbdopplungen werden
lokal aufgelöst (`pickFreeColor`).

### Optik

Alles prozedural, weiterhin ohne externe Assets:

* **Himmel** als Farbverlaufs-Kuppel mit atmendem Horizontband (eigener Shader),
  Nebelfarbe = Horizontfarbe, dadurch verschwindet Entferntes im Dunst statt in
  schwarzem Nichts
* **Sternenfeld** (700 Punkte) und ein **Gitter tief unter dem Level** — beides
  folgt der Kamera und gibt dem Abgrund Tiefe
* **ACES-Tone-Mapping** mit Belichtung 1.15; alle Leuchtelemente (Kantenlicht,
  Visor, Kern, Partikel, Namensschilder) sind davon ausgenommen und bleiben knackig
* **Instanzfarben**: jede Box bekommt eine leichte Helligkeits- und Farbstreuung
  (0.87–1.20), was den Flächen die "alles exakt gleich"-Optik nimmt — ohne einen
  einzigen zusätzlichen Draw Call
* **Kantenlicht**: Plattformen bekommen umlaufende Leuchtkanten, hohe Wände ein
  Lichtband unter der Oberkante (~400 Kanten pro Dungeon in 4 Draw Calls)
* **Vignette** als CSS-Overlay (kostet nichts auf der GPU)

Der gesamte Dungeon zeichnet sich in unter 40 Draw Calls. Falls es zu dunkel oder
zu hell wirkt: `RIFTRUSH.setExposure(1.4)` wirkt sofort.

### Boss: Rift Guardian

Der Boss ist der vorletzte Room jeder Route (`... → BOSS → FINISH`) und nutzt dasselbe
Room-, Checkpoint-, Timer- und Race-System wie alles andere. Kein HP-Balken, kein
Stehenbleiben — der Boss erzeugt ausschließlich Bewegungsaufgaben.

**Phase 1 — Schild.** Drei Mechanismen stehen auf Hochplattformen und müssen per
Parkour erreicht werden. Angriffe: Schockwelle (überspringen) und markierte Einschläge.

**Phase 2 — Kern.** Das Schild fällt, der Kern öffnet sich auf ~15 m Höhe. Hinauf geht
es nur über die Route Wallrun → Sprungplattform → Lift → Laufsteg. Angriffe: rotierender
Laser, stärkere Schockwellen, einstürzende Bodenfelder.

**Phase 3 — Flucht.** Der erste Treffer am Kern startet einen 30-Sekunden-Countdown,
öffnet die Ausgangstür und lässt die Arena einstürzen. Läuft der Countdown ab, reisst
der Boss alles Einstürzbare auf einmal weg und feuert im 1,7-Sekunden-Takt weiter —
die mittlere Bodenspur bleibt aber immer stehen, der Ausgang ist also weiterhin
erreichbar. Ablaufen kostet Zeit, nicht den Run.

**Führung.** In jeder Phase markiert eine Lichtsäule das nächste Ziel (nächster
Mechanismus → Kern → Ausgang), das HUD nennt es im Klartext samt Entfernung.

Der erste Spieler am Kern bekommt eine Zeitgutschrift von 2,5 s (`BOSS_TIME_BONUS`) —
genug als Belohnung, zu wenig, um das Rennen allein zu entscheiden. Alle anderen laufen
normal weiter; das Match endet erst über das reguläre Ziel.

Synchronisation: der Host schaltet Phasen und plant Angriffe, verschickt werden nur
Ereignisse (~0,33 Nachrichten/s über den reliable Channel). Treffer wertet jeder Client
für den eigenen Spieler aus, wie beim bestehenden Knockback. Späteinsteiger bekommen
einen Boss-Snapshot mit der Start-Nachricht.

Audio: `src/core/AudioHooks.js` feuert benannte Ereignisse (`boss:intro`,
`boss:mechanism`, `boss:shield-down`, `boss:shockwave`, `boss:laser-warning`,
`boss:hit`, `boss:phase`, `boss:escape`, `race:finish`). Sounds lassen sich später
anhängen, ohne Gameplay-Code zu ändern:

```js
RIFTRUSH.audio.on('boss:shockwave', () => mySound.play());
```

### Performance

* Statische Level-Geometrie als **InstancedMesh pro Material** → wenige Draw Calls.
* Kollision über **AABB + Spatial Hash**, keine Physik-Engine.
* Keine Objekt-Erzeugung im Frame-Loop (wiederverwendete Scratch-Arrays/Vektoren).
* Geometrien und dunkle Materialien werden von allen Figuren geteilt; pro Spieler
  entstehen nur vier eigene Materialien (Anzug, Visor, Kern, Ring).
* Partikel: ein einziger InstancedMesh-Pool (320 Stück) für sämtliche Effekte.
* Schatten: eine 1024er Shadow-Map, deren Kamera dem Spieler folgt. Abschaltbar über
  `RIFT_CONFIG.SHADOWS = false` bzw. `RIFTRUSH.setShadows(false)` in der Konsole.
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
* Sounds an die Audio-Hooks hängen
* weitere Boss-Angriffe (die Angriffsliste in `BossFight` ist eine einfache Tabelle)
* Ghost des besten Runs (lokal via `localStorage`)
* Gesichter/Details der Figur über eigene BufferGeometry statt Primitiven
* Shockwave- und Trap-Ability (Registry steht bereits)
* Autoritativer Server statt Host-Autorität
* Sound, Partikel, weitere Room-Module
