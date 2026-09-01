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
| **Zu Fuß** | `WASD` bewegen (Figur bleibt bildmittig, seitwärts wird gestrafet) · `Shift` sprinten · `Leertaste` springen · Maus zielen · `Linksklick` feuern · `1` `2` `3` Waffe · Mausrad wechseln · `R` nachladen · `E` einsteigen |
| **Im Flug** | Maus steuern · `A`/`D` rollen · `Q`/`E` gieren · `W`/`S` Schub · `Shift` Boost · `Linksklick` Bordkanonen · `Rechtsklick` Raketen/Bomben · `F` aussteigen |
| **Im Fall** | `Leertaste` Fallschirm öffnen · `WASD` steuern (W beschleunigt, A/D seitlich) |
| **Sonstiges** | `H` HUD ein-/ausblenden · `Esc` Mauszeiger freigeben |

**Auf der gegnerischen Insel landen** geht auf zwei Wegen. Entweder du fliegst flach an und
setzt unter 55 m/s auf — der Pilot steigt dann automatisch aus. Oder du steigst mit `F` in der
Luft aus und öffnest mit der Leertaste den Schirm. Der Schirm gleitet etwa 2,5 Meter waagerecht
pro Meter Höhenverlust, aus 400 Metern kommst du also rund einen Kilometer weit — genug, um
von über der Mitte des Luftraums die gegnerische Insel zu erreichen. Ohne Schirm aufzuschlagen
ist tödlich.

**Wo ist das Flugzeug?** Auf der eigenen Insel stehen drei Maschinen sichtbar hintereinander:
der Interceptor im Hangar, der Striker auf der Startbahn, der Bomber ganz vorn auf dem
Katapultdeck. Du steigst in die ein, vor der du gerade stehst — der HUD-Hinweis
(`E — BOMBER BESTEIGEN`) sagt dir welche. Die Wahl in der Lobby ist nur eine Voreinstellung;
entscheidend ist, zu welchem Startplatz du läufst.

Landen funktioniert:
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

---

## Nachgebessert nach dem ersten Spieltest

- **Kamera zentriert.** Sie kreist jetzt um einen Punkt über dem Helm statt um die Schulter.
  Die Figur bleibt waagerecht immer in der Bildmitte, auch beim Strafen.
- **Strafe-Animation.** Die Figur schaut weiter in Blickrichtung, setzt aber sichtbar
  Seitwärtsschritte (Scherenschritt, Körperneigung in die Laufrichtung).
- **Flugzeuge sind sichtbar.** Vorher stand nur ein Leuchtring auf dem Startplatz.
  Jetzt parken drei Maschinen gestaffelt auf dem Deck, mit Triebwerks-Glimmen im Stand.
- **Bloom entschärft.** Schwelle von 0.72 auf 0.9, Stärke von 0.62 auf 0.48. Die
  Startbahn-Markierungen waren zu weißen Flecken ausgebrannt; ihre Leuchtstärke ging
  zusätzlich von 2.2 auf 0.55 runter.
- **Deck detailliert.** Plattenfugen, abgesetzte Fahrbahn zum Core, Gefahrenzone vor dem
  Hangartor, gedämpfte Randbeleuchtung. Vorher war es eine einzige flache Fläche.
- **Schwebende Rampen entfernt.** Zwei gekippte Platten hingen sichtbar in der Luft neben
  dem Core-Podest. Die Treppenstufen daneben erfüllen denselben Zweck.
- **Beleuchtung.** Zusätzliches kaltes Gegenlicht ohne Schatten trennt Silhouetten vom
  Hintergrund; Umgebungs- und Hemisphärenlicht deutlich angehoben.
- **Himmel.** Weniger Dither-Rauschen, weichere Horizontstufe, weniger gesättigtes Orange.

---

## Balance- und Performance-Runde

**Flak entschärft.** Die Türme richteten vorher rund 44 Schaden pro Sekunde an — ein Striker
war nach fünf Sekunden im Anflug erledigt. Geändert:

| | vorher | jetzt |
|---|---|---|
| Reichweite | 420 m | 250 m |
| Nachladezeit | 0,55–0,95 s | 1,8–2,8 s |
| Schaden pro Treffer | 14 | 7 |
| Trefferchance | 60 % fest | 55 %, sinkt mit Tempo, halbiert bei Boost |
| Zielerfassung | sofort | 1 s Verfolgung nötig |

Damit sind die Türme eine Abschreckung im Nahbereich statt einer Todeszone. Ein schneller
Anflug mit Boost kommt durch; wer langsam über der gegnerischen Insel kreist, wird bestraft.
Bei Flak-Treffern erscheint jetzt ein HUD-Hinweis.

**Standbilder behoben.** Zwei Ursachen:

1. *Speicherleck.* Jedes bestiegene Flugzeug erzeugte neue Geometrien und Materialien, die
   beim Zerstören nie freigegeben wurden. Über eine Runde mit vielen Respawns wuchs der
   GPU-Speicher stetig. Es gibt jetzt eine Freigabe, die objekteigene Ressourcen abräumt
   und geteilte Materialien aus dem Cache in Ruhe lässt.
2. *GC-Pausen.* Die Hauptschleife allokierte mehrere hundert `Vector3` pro Frame —
   Projektil-Update, Trefferprüfung, beide Kameras, Radar und Remote-Spieler. Alles läuft
   jetzt über wiederverwendete Rechenpuffer.

---

## Zweite Code-Review

Systematischer Durchgang nach Fehlerklassen statt nach Symptomen. Gefunden und behoben:

**Korrektheit**

- *Veraltete Transformationen.* Three.js aktualisiert Weltmatrizen erst beim Rendern.
  Sowohl die Mündung der Handwaffe als auch die Bordkanonen lasen die Matrix des
  vorherigen Frames — Schüsse kamen aus der Position von vor 16 ms, nach einem Respawn
  sogar vom Sterbeort. Avatar wird jetzt vor dem Feuern gesetzt, die Kanonen rechnen
  direkt aus Lage und Position statt aus der Matrix.
- *Landen war praktisch unmöglich.* Die Schwelle lag fest bei 55 m/s, der Interceptor
  fliegt aber mit 105 Reisetempo — man hätte tief in den Strömungsabriss bremsen müssen.
  Die Schwelle richtet sich jetzt nach der Maschine (72 % des Reisetempos, mindestens 50).
- *Kollision nur am Mittelpunkt.* Ein Bomber mit 29 m Spannweite flog durch Gebäude
  hindurch. Es werden jetzt Rumpfmitte und beide Flügelspitzen geprüft.
- *Matchuhr verlor Zeit*, wenn ein Frame länger als eine Sekunde brauchte.
- *Core blieb nach einer Runde zerstört.* `setHP` setzte das Zerstört-Flag nie zurück.
  Es gibt jetzt ein vollständiges Zurücksetzen für Cores, Türme, Anlagen, Startplätze,
  Projektile und Wracks.

**Autorität und Netzwerk**

- *Kein Schutz vor Beschuss von Teamkameraden.* Der Host prüfte Betrag und Feuerrate,
  aber nie, ob Schütze und Ziel überhaupt gegnerisch sind — ein manipulierter Client
  hätte das eigene Team ausschalten können. Wird jetzt serverseitig abgewiesen; Schaden
  an sich selbst (Splash, Absturz, Sturz) bleibt erlaubt.
- *`undefined` im Protokoll.* Schadensmeldungen ohne Schützen (Flak, Unfall) sendeten
  ein undefiniertes Feld; jetzt sauber `null`.
- *Hostabbruch mitten im Match* ließ die Runde ohne Autorität weiterlaufen. Sie wird
  jetzt mit klarer Meldung beendet.

**Bedienung**

- `Tab` war auch im Menü blockiert, dadurch kein Wechsel zwischen den Eingabefeldern.
- Es gab keinen Weg aus einem laufenden Match. Bei freigegebener Maus erscheint jetzt
  ein Abbruch-Knopf.
- Killfeed formulierte Unfälle als „SKYFALL zerschellt SPIELER". Selbstverschuldete
  Tode nennen jetzt nur noch das Opfer.

**Politur**

- *Trefferrückmeldung.* Vorher gab es keinerlei Hinweis, ob ein Schuss gesessen hat.
  Jetzt ein Treffermarker am Fadenkreuz, rot bei einem Abschuss, auf 10 Ereignisse pro
  Sekunde begrenzt.
- *Abschusszähler* im HUD.
- *Zielmarkierungen.* Aus 500 Metern war ein Flugzeug nicht vom Himmel zu unterscheiden.
  Gegner und Verbündete tragen jetzt einen entfernungsskalierten Punkt in Teamfarbe, der
  unter 60 Metern ausblendet, damit das Modell selbst zur Geltung kommt.
- Zeitanzeige läuft im HUD-Takt statt pro Frame — spart rund 120 DOM-Schreibvorgänge
  pro Sekunde.
