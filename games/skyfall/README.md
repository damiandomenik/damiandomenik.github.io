# SKYFALL

Multiplayer-Luftkampf und Base-Raid zwischen zwei schwebenden Festungen.
Läuft als statische Website, ohne Backend, ohne Build-Schritt, ohne externe 3D- oder Texturassets.

---

## Hochladen und starten

1. Ordner nach `games/skyfall/` im Repository legen.
2. GitHub Pages für das Repository aktivieren (Settings → Pages → Branch `main`, Ordner `/root`).
3. Aufrufen: `https://<user>.github.io/<repo>/games/skyfall/`

Kein `npm install`, kein Bundler. Three.js und PeerJS kommen per CDN, ES-Module werden direkt geladen.

> Lokal testen: `python3 -m http.server` im Repository-Root starten und
> `http://localhost:8000/games/skyfall/` öffnen. Ein `file://`-Aufruf funktioniert
> nicht, weil ES-Module CORS brauchen.

---

## Zusammen spielen

1. Ein Spieler klickt **RAUM ERÖFFNEN**. Er bekommt einen fünfstelligen Code, z. B. `X7K2P`.
2. Er gibt den Code weiter (Button *CODE KOPIEREN*).
3. Alle anderen klicken **RAUM BEITRETEN**, tippen den Code ein und landen in derselben Lobby.
4. In der Lobby wählt jeder sein **Team** (Blaue oder Rote Festung) und seine **Maschine**, dann **BEREIT**.
5. Sobald alle bereit sind, startet der Host das Match.

Neue Spieler werden automatisch dem kleineren Team zugeteilt, können aber jederzeit wechseln.
Ein Wechsel setzt den Bereit-Status zurück, damit niemand versehentlich mit falscher Zuordnung startet.

Der Host kann auch alleine starten — dann ist es ein Trainingslauf gegen eine leere Festung.

---

## Steuerung

| Situation | Tasten |
|---|---|
| **Zu Fuß** | `WASD` bewegen · `Shift` sprinten · `Leertaste` springen · Maus zielen · `Linksklick` feuern · `1` `2` `3` Waffe · Mausrad wechseln · `R` nachladen · `E` einsteigen |
| **Im Flug** | Maus steuern · `A`/`D` rollen · `Q`/`E` gieren · `W`/`S` Schub · `Shift` Boost · `Linksklick` Bordkanonen · `Rechtsklick` Raketen/Bomben · `F` aussteigen |
| **Im Fall** | `Leertaste` Fallschirm · `WASD` steuern |
| **Sonstiges** | `H` HUD ein-/ausblenden · `Esc` Mauszeiger freigeben |

Einsteigen geht nur an einem der drei Startplätze im eigenen Hangar. Landen funktioniert:
flach anfliegen, unter 55 m/s aufsetzen — der Pilot steigt automatisch aus. Wer schneller
oder schräger aufkommt, zerschellt.

---

## Spielziel

Jede Festung hat einen Core mit 1000 HP. Wer den gegnerischen Core zuerst auf null bringt, gewinnt.
Läuft die Zeit von 15 Minuten ab, gewinnt die Seite mit dem höheren Core-Stand.

Der Core reagiert sichtbar auf Schaden: ab 75 % Funken, ab 50 % Alarmleuchten und Sirene,
ab 25 % Rauch und flackernde Instabilität, ab 10 % extremes Pulsieren, bei 0 % eine Kettenexplosion.

Waffen wirken unterschiedlich stark gegen den Core — Bordkanonen kratzen nur (Faktor 0,3–0,45),
Raketen treffen voll (1,0), Bomber-Bomben am härtesten (1,6). Der Core lässt sich also nicht
allein aus der Luft mit Kanonen wegputzen; jemand muss landen oder bomben.

---

## Dateien

```
games/skyfall/
├── index.html        Markup für Menü, Lobby, HUD, Endbildschirm
├── style.css         Dunkles Industrie-UI
├── game.js           Hauptschleife, Spieler, Flug, Kampf, Host-Autorität, HUD
├── models.js         Prozedurale Flugzeuge, Piloten, Türme, Materialien
├── world.js          Himmel, Wetter, Wolken, Inseln, Core-Reaktor
├── fx.js             Gepoolte Partikel, Trümmer, Explosionen
├── audio.js          Synthetische Sounds über die Web Audio API
├── multiplayer.js    WebRTC/PeerJS, Lobby, Nachrichtenrouting
├── assets/sounds/    Leer — der Prototyp braucht keine Samples
└── README.md
```

---

## Netzwerkarchitektur

**Signaling** läuft über die öffentliche PeerJS-Cloud, damit kein eigener Server nötig ist.
Der Host registriert die Peer-ID `skyfall-<CODE>` — der hintere Teil ist der Room-Code.
Danach läuft das Gameplay P2P über WebRTC-DataChannels.

**Topologie** ist ein Stern: jeder Client hat genau eine Verbindung zum Host.
Bei 6 Spielern ist das deutlich einfacher und stabiler als ein volles Mesh.

**Autorität** liegt beim Host für: Core-HP, Spieler- und Rumpf-HP, Tod, Respawn,
zerstörte Anlagen, Matchzeit und Sieg. Clients besitzen nur ihre eigene Transform-Information.

Synchronisiert werden Position, Rotation, Geschwindigkeit, Spielerzustand, gewählte Maschine,
Schub und Boost (20 Hz, interpoliert), außerdem ereignisbasiert: Schüsse, Schaden, Tod,
Respawn, Core-HP, zerstörte Objekte und Matchstatus.

**Wie weit Clients einander trauen:** gar nicht direkt. Ein Client erkennt Treffer für seine
eigenen Projektile und schickt einen *Schadensanspruch* an den Host. Der Host prüft, ob der
Absender lebt, ob der Betrag zur behaupteten Waffe passt (Tabelle `MAX_CLAIM`) und ob die
Trefferrate plausibel ist (max. 25 Ereignisse pro Sekunde). Erst dann wird der Schaden
angewendet und autoritativ an alle verteilt. Die Absender-ID wird beim Host erzwungen —
niemand kann sich als jemand anderes ausgeben.

Das ist bewusst die einfache Variante. Sie ist erweiterbar: der nächste Schritt wäre, dass der
Host die Projektile selbst simuliert und Trefferansprüche gegen ein Positionsarchiv der letzten
250 ms prüft (Lag Compensation). Die Nachrichtenstruktur muss sich dafür nicht ändern.

---

## Was in dieser Version funktioniert

Menü, Lobby mit Room-Code und Teamwahl, Multiplayer über WebRTC, zwei Inseln, drei fliegbare
Maschinen, Flugmodell mit Boost und Strömungsabriss, Bordkanonen, Raketen, Bomben, Aussteigen
mit Fallschirm, Landen, Bodenbewegung mit Kollision, drei Bodenwaffen, Core mit fünf sichtbaren
Schadensstufen, zerstörbare Anlagen, Flak-Türme, Tod und Respawn nach 3 Sekunden, Sieg und
Niederlage, zwei Wetterlagen mit Blitzen, Wolkenmeer, Fog, Bloom, Partikel, Explosionen,
Trümmer, Kamera-Shake, Radar, HUD und synthetischer Sound.

## Was noch fehlt

- **Lag Compensation.** Bei hohem Ping trifft man schnelle Ziele schlechter, weil der Host keine
  Positionshistorie führt. Bei 2–6 Spielern in Europa ist es spielbar, für ernsthaften Wettbewerb nicht genug.
- **Spätzugang.** Wer beitritt, während ein Match läuft, landet in der Lobby ohne Matchzustand.
  Der Host erkennt den Fall (`lateJoin`), verschickt aber noch keinen Zustands-Snapshot.
- **Teilzerstörung von Gebäuden.** Anlagen sind ganz oder gar nicht zerstört; einzelne Bauteile
  fallen noch nicht separat ab.
- **Granaten und Sprengladungen** aus der ursprünglichen Waffenliste. Blaster, Scatter und
  Raketenwerfer sind drin, die beiden Wurfwaffen nicht.
- **Reconnect.** Fällt die Verbindung zum Host weg, endet die Sitzung; ein erneuter Beitritt
  ist nicht implementiert.

Es gibt keine Platzhalter-Funktionen im Code. Was oben unter "funktioniert" steht, ist
implementiert; was fehlt, steht hier.

---

## Performance

Ziel sind 60 FPS auf einem normalen Gaming-Laptop. Dafür:
Partikel und Trümmer sind vorab allokierte Pools ohne Laufzeit-Allokation,
Greebles laufen als `InstancedMesh`, nur eine Lichtquelle wirft Schatten und ihre
Schattenkamera folgt dem Spieler, Netzwerkupdates gehen mit 20 Hz statt pro Frame,
und Remote-Spieler werden interpoliert statt hart gesetzt.

Wenn es ruckelt: Bloom kostet am meisten. In `game.js` in `initRenderer` die Zeile mit
`composer.addPass(bloom)` auskommentieren — das Spiel läuft dann ohne Glow weiter.

---

## Nächste sinnvolle Schritte

1. Lag Compensation im Host (Positionshistorie + Rückrechnung).
2. Zustands-Snapshot für Spätzugang.
3. Gebäude in mehrere abwerfbare Teile zerlegen.
4. Granaten und Sprengladungen ergänzen.
5. Zweite Karte oder asymmetrische Inselvarianten.

---

## Bugfix-Runde nach dem ersten Build

Elf Fehler wurden vor der Auslieferung behoben:

1. **Partikel-Transparenz** — die Start-Alpha wurde jeden Frame ueberschrieben,
   Rauch war dadurch komplett deckend statt halbtransparent.
2. **Verlassene Spieler** — der Host loeschte sie beim Gegenueber, aber nicht bei sich
   selbst; sein Bildschirm behielt eine eingefrorene Spielerfigur.
3. **Eigenbeschuss am Core** — Splash-Schaden konnte den eigenen Core treffen.
4. **Trefferbremse zu eng** — der Interceptor feuert 23 Schuss/s, die Grenze lag bei 25;
   bei vollen Treffern wurden Schaeden verworfen. Jetzt 40.
5. **Rumpf-HP nach dem Aussteigen** — der Host wusste nichts vom Ausstieg und rechnete
   weiter mit einem Flugzeug. Neue `unboard`-Nachricht.
6. Leerer Platzhalter-Partikel im Fallschirm-Zweig entfernt.
7. **Tote Remote-Spieler** wurden vom naechsten Transform-Paket sofort wieder sichtbar.
8. **Remote-Respawn** — Mitspieler blieben nach ihrem Respawn unsichtbar, weil der
   Zustandswechsel nicht ausgewertet wurde.
9. **Kamera nach dem Ausstieg** — Blickrichtung sprang, weil Fluglage und Fussgaenger-Blick
   nicht uebergeben wurden.
10. Dasselbe beim Landen.
11. **Landen in Geometrie** — wer auf der Startbahn aufsetzte, stand im Kollider fest.
    Der Pilot wird jetzt beim Aussteigen herausgeschoben.
