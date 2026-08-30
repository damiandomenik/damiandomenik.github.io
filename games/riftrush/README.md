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

## 3. Zusammen spielen

**Es ist nichts einzurichten.** Wer eine Lobby erstellt, bekommt einen sechsstelligen
Zahlencode. Die anderen tippen ihn im Menü ein und sind drin.

```
Spieler 1: „Lobby erstellen"  ->  Code 482913
Spieler 2: Code eintippen     ->  Beitreten
```

### Warum es trotzdem eine Vermittlungsstelle gibt

Der Host ist der Server — für das Spiel: Er bestimmt Seed, Matchstart und Boss-Ablauf.
Aber ein **Browser kann keine Verbindungen annehmen**: kein offener Port, keine
erreichbare Adresse, der Router lässt nichts von außen durch. Der Browser des Gastes
kann den des Hosts also nicht direkt anrufen.

Deshalb hat jedes Browserspiel mit „Host + Code" eine Vermittlungsstelle — meist
denselben Server, von dem das Spiel geladen wird. Man sieht sie nie, weil der Entwickler
sie betreibt. Auf GitHub Pages gibt es kein Backend, also nutzt RiftRush einen
**öffentlichen PeerServer**, den niemand einrichten oder bezahlen muss.

Der Vermittler reicht ausschließlich den Verbindungsaufbau durch. Sobald die Spieler
verbunden sind, läuft der gesamte Spielverkehr direkt zwischen ihnen — ein Test prüft
das ausdrücklich nach: während des Spielens sieht der Vermittler keine einzige
Nachricht mehr.

Alle Spieler verbinden sich untereinander (volles Netz, bis 8 Spieler). Der Host teilt
dafür die Kennungen weiter, sodass sich auch die Gäste direkt erreichen.

Ändern lässt sich der Vermittler in `src/core/Config.js`:

```js
PEER_SERVERS: ['wss://0.peerjs.com'],
PEER_KEY: 'peerjs',
```

Die Anmeldung ist Zeile für Zeile mit dem offiziellen PeerJS-Client 1.5.5 abgeglichen
(Pfad, Parameter, Versionsangabe, Nachrichtentypen, Lebenszeichen) — ein Test prüft das
mit, damit es nicht auseinanderläuft.

Im Menü steht eine Statuszeile: Sie prüft beim Start, ob der Vermittler antwortet, und
sagt im Fehlerfall, was zu tun ist — statt dass ein Beitritt wortlos scheitert.

`PEER_SERVERS` ist eine **Liste**: Ist der erste Eintrag tot, rückt der Verbindungsaufbau
automatisch auf den nächsten. Ein eigener PeerServer (`npx peerjs --port 9000`) lässt sich
einfach vorne eintragen — an der Bedienung ändert sich nichts.

### Optional: eigener Signaling-Server mit Lobby-Liste

Wer will, kann den Server aus `/server` betreiben und im Menü unter „Erweitert"
eintragen. Dann gibt es zusätzlich eine **Liste offener Lobbys**, in die man ohne Code
per Klick beitritt. Vorlagen: `render.yaml`, `Dockerfile`, `fly.toml`.

> Die Seite läuft über HTTPS, deshalb muss ein eigener Server über `wss://` erreichbar
> sein. Bei `ws://` blockiert der Browser; das Menü weist darauf hin.

### Notfall: Verbindungscode von Hand

Falls gar nichts geht, lässt sich in der Lobby unter „Notfall" der vollständige
Verbindungscode direkt austauschen (rund 300 Zeichen, für zwei Spieler). Das braucht
keinerlei Vermittler, ist aber umständlich — deshalb ist es zugeklappt.


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
* **Zahlencodes** (gegen einen nachgebauten PeerServer, der sich exakt ans dokumentierte
  Protokoll hält): Codeerzeugung und -prüfung, Host meldet sich unter dem Code an, zwei
  Gäste treten allein mit der Zahl bei, volles Netz auch zwischen den Gästen, während des
  Spielens läuft nachweislich nichts mehr über den Vermittler, unbekannter Code verbindet
  nicht, belegter Code wird gemeldet, Verlassen wird bemerkt, Verbindung wird durch
  Lebenszeichen gehalten, toter Vermittler wird übersprungen und der nächste genommen,
  Erreichbarkeitsprüfung meldet den funktionierenden Server bzw. schlägt sauber fehl,
  Anmelde-URL entspricht exakt dem offiziellen PeerJS-Client (Pfad, key, id, token,
  Version), unbekannter Code meldet „niemand erreichbar" statt stumm zu bleiben
* **Menü**: Zahlenfeld filtert Buchstaben, unvollständiger Code liefert eine klare
  Meldung ohne Verbindungsversuch, fehlgeschlagener Beitritt bleibt nicht stumm
* **Server-Voreinstellung**: `CONFIG.SIGNALING_URL` wird ins Menü übernommen,
  Deployment-Vorlagen (`render.yaml`, `Dockerfile`, `fly.toml`) sind vorhanden und
  starten den richtigen Prozess; `ws://` auf einer HTTPS-Seite wird bemängelt
* **Verbindungscodes**: Kompression und Rundlauf verlustfrei, TCP-Kandidaten entfernt,
  nur kopierfeste Zeichen, alte Codes weiterhin lesbar
* **Menüablauf ohne Server**: kein irreführendes Room-Code-Feld, Direktverbindung wird
  angeboten, Verbindungscode erscheint, Schrittanzeige wandert weiter, unsinnige Eingabe
  liefert eine verständliche Fehlermeldung
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
* **Boss**: Arena und Endstrecke in jeder Route korrekt eingebettet, Mechanismen erhöht
  und Portal hoch genug (Parkour zwingend), Ablauf Mechanismen → Portal → Endstrecke,
  Portal erst nach allen drei benutzbar und nur einmal, **fremde Mechanismen zählen
  nachweislich nicht**, Landung hinter dem Portal steht auf festem Boden, Angriffe treffen
  am Boden und verfehlen beim Sprung, Vorwarnzeiten, Treffer setzen zum Checkpoint
  zurück statt zu stossen, Schonzeit danach greift, Angriffe erreichen nachweislich
  mehrere Höhen (Rotorarme 7/11 m, Laser 2/7 m, Einschläge 0/6/7 m) und ein hoher
  Rotorarm trifft am Boden nicht, keine Treffer-Dauerschleife
  (6 Respawns in 60 s bei Untätigkeit), Host/Client-Synchronisation inkl. Späteinsteiger
  und Traffic-Budget, Zeitbonus nach Rennzeit statt Paketreihenfolge,
  Modellbudget (33 Meshes, 1.184 Dreiecke, ein Licht)
* **Charakter-Asset**: keine Durchdringung von Armen/Beinen und Rumpf über alle Clips,
  GLB lädt mit dem echten GLTFLoader, Mesh-/Material-/Dreiecks-
  budget, Proportionen gegen die 1,8-m-Hitbox, vollständiges Rig inkl. Hierarchie,
  alle 16 geforderten Clips, jeder Clip bewegt das Rig nachweislich und ohne NaN,
  Schnittstellen-Gleichheit beider Figur-Varianten, eigene Skelette und Farben pro Spieler
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
    PeerSignaling.js     Beitreten per Zahlencode über einen öffentlichen Vermittler
    LobbyBrowser.js      Liste offener Lobbys (nur mit eigenem Signaling-Server)
    RemotePlayer.js      Snapshot-Interpolation (+ kurze Extrapolation)

  dungeon/
    RoomRegistry.js     15 Room-Typen (Parkour, Vertical, Trap, Split, Switch,
                        Moving, Chase, PvP, Speed, Descent, Final, Finish …)
    DungeonRoom.js      Builder-API für Rooms (box/plat/hazard/moving/blinker/door)
    DungeonGenerator.js Seed → Route → InstancedMeshes + Collider
    Checkpoint.js       Respawn-Punkte
    Hazards.js          Materialien & dynamische Meshes

  boss/
    BossArena.js       Arena-Geometrie (Kacheln, Mechanismen, Kletterroute, Portal)
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

Es gibt **zwei austauschbare Varianten** mit identischer Schnittstelle. Standard ist
das GLB-Modell aus dem Character Sheet; schlägt das Laden fehl, läuft automatisch die
prozedurale Figur weiter — das Spiel startet also in jedem Fall.

```js
RIFTRUSH.setCharacterModel('procedural');   // ohne Modell
RIFTRUSH.setCharacterModel('glb');          // zurück zum Modell
```

#### Rift Runner (GLB)

`assets/RiftRush_Player.glb` — 4.856 Dreiecke, 5 Materialien, 23 Knochen, 16 Clips,
538 KB. Erzeugt von `tools/build_player_glb.py`, also reproduzierbar und versionierbar:

```bash
python3 tools/build_player_glb.py assets/RiftRush_Player.glb
```

Aufbau in Schichten statt „viele kleine Würfel": Helmschale mit Kalotte, Kamm,
Ohrmodulen und breitem Visierband; Kragenring, obere und untere Brustpanzerung mit
Brustplatte und Energiekern; zweiteiliger Bauch, Gürtel und Hüftmodule; kompakter
Backpack mit Seitenpods und Kern; Arme mit zweilagigem Schultermodul, Gelenkprismen an
Schulter, Ellbogen und Handgelenk; Beine mit Oberschenkelpanzerung, Kniescheibe,
Wadenpanzer und Stiefeln mit großer Sohle, Kappe und Ferse.

Gelenke sind Prismen statt Kästen — bei starrem Skinning reißen sonst beim Animieren
Lücken auf. Die Fasen an allen Platten erzeugen die schmalen Glanzkanten; ohne sie sähe
die Figur nach Klötzchen aus. Höhe 1,81 m, Breite 0,61 m an den Schultern.

Bewusst unter dem Zielbudget von 10–25k Dreiecken: bei 8 Spielern sind das rund 39k
statt bis zu 200k. Für ein Browserspiel ist das der bessere Kompromiss.

Farbvarianten laufen über zwei Materialien (`Accent`, `Visor`), die pro Spieler geklont
und eingefärbt werden. Die Panzerung bleibt bei allen gleich, genau wie im Sheet.

Clips: `Idle Walk Run Sprint JumpStart Jump Fall Land Crouch Slide WallRun WallJump
Dash Punch Hit Death`.

**Editierbare .blend:** Blender lief in meiner Umgebung nicht, deshalb liegt statt einer
fertigen Datei ein Aufbauskript bei, das dieselben Daten benutzt:

```bash
blender --background --python tools/build_riftrush_player_blender.py         # .blend
blender --background --python tools/build_riftrush_player_blender.py -- --glb  # + GLB
```

#### Prozedurale Figur

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

**Jeder sammelt für sich.** In der Arena stehen drei Mechanismen auf Hochplattformen.
Sie zählen **pro Spieler**: berührt jemand einen, ist er nur für ihn erledigt — die
anderen müssen ihn selbst noch anlaufen. Das macht den Boss zum Rennen statt zur
Gemeinschaftsaufgabe.

**Portal.** Wer alle drei hat, für den öffnet sich ein Portal über der Arenamitte.
Hinauf geht es nur über die Route Wallrun → Sprungplattform → Lift → Laufsteg, von dort
springt man hinein. Es ist der einzige Weg aus der Arena — die Rückwand ist geschlossen.

**Endstrecke.** Das Portal versetzt auf `Rift Descent`, einen 104 m langen Parkour-
Abschnitt mit beweglichen Plattformen, schwingenden Gefahrenbalken, einer Wallrun-
Passage und verschwindenden Platten. Danach kommt das reguläre Ziel.

**Treffer kosten den Abschnitt.** Wer von einem Angriff erwischt wird, landet am
letzten Checkpoint — also am Arena-Eingang. Bereits berührte Mechanismen bleiben
erhalten, verloren gehen Zeit und Position. Danach gilt eine Schonzeit von 2,5 s, sonst
liefe man beim Respawn direkt in dieselbe Welle.

**Auch oben ist man nicht sicher.** Der Boss greift auf drei Ebenen an:

| Angriff | Höhe | Ausweichen |
|---|---|---|
| Schockwelle | Boden | drüberspringen |
| Einschläge | Boden **und Hochplattformen** | markierte Zonen verlassen |
| Laser | 1,5 m **oder 6,9 m** | springen oder Ebene wechseln |
| Rotorarme | 6,6 m, 10,8 m **oder 13,2 m** | in Bewegung bleiben, Timing |
| Stampfer | nahe am Boss | Abstand halten |
| Einsturz | Bodenfelder | Feld verlassen |

Die Rotorarme sind der Grund, warum die Kletterroute kein sicherer Hafen mehr ist: zwei
Balken rotieren 3,6 s lang auf einer der drei Höhen durch die Arena — inklusive des
Laufstegs am Kern.

Wichtig für die Fairness: Es läuft immer nur **ein** arenaweiter Angriff (Schockwelle,
Laser, Rotorarme). Zwei gleichzeitig wären nicht ausweichbar, weil man zur selben Zeit
springen und die Ebene wechseln müsste. Gemessen ist das längste tödliche Zeitfenster an
einem Punkt 0,17 s — ein Sprung hält 0,61 s in der Luft, jeder Angriff ist also
überspringbar. Ein Test prüft das an vier Positionen über je 90 s.

Der Angriffstakt zieht mit der Kampfdauer von 4,6 s auf 2,4 s an, Trödeln wird also
teurer.

**Führung.** Eine Lichtsäule markiert das nächste Ziel (nächster eigener Mechanismus →
Portal), das HUD nennt es im Klartext samt Entfernung.

Der erste Spieler durchs Portal bekommt eine Zeitgutschrift von 2,5 s
(`BOSS_TIME_BONUS`). Entschieden wird über die **Rennzeit**, nicht über die Reihenfolge
der Netzwerkpakete — sonst gewänne bei Latenz der mit der besseren Leitung. Trifft
später eine kleinere Zeit ein, wandert der Bonus.

Synchronisation: der Host startet den Kampf und plant die Angriffe (~0,23 Nachrichten/s
über den reliable Channel). Der Mechanismus-Fortschritt ist bewusst **kein** gemeinsamer
Zustand — er liegt pro Client und wird nur informativ mitgeteilt. Treffer wertet jeder
Client für den eigenen Spieler aus, wie beim bestehenden Knockback.

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
