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
| **Zu Fuß** | `WASD` bewegen (Figur bleibt bildmittig, seitwärts wird gestrafet) · `Shift` sprinten · `Leertaste` springen · Maus zielen · `Linksklick` feuern · `1`–`5` Waffe · Mausrad wechseln · `R` nachladen · `E` einsteigen |
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

Jede Festung hat einen Core mit 800 HP, geschützt von fünf Schildknoten. Wer den gegnerischen Core zuerst auf null bringt, gewinnt.
Läuft die Zeit von 15 Minuten ab, gewinnt die Seite mit dem höheren Core-Stand.

Der Core reagiert sichtbar auf Schaden: ab 75 % Funken, ab 50 % Alarmleuchten und Sirene,
ab 25 % Rauch und flackernde Instabilität, ab 10 % extremes Pulsieren, bei 0 % eine Kettenexplosion.

**Der Schild ist der eigentliche Kern des Spiels.** Solange alle fünf Schildknoten einer Insel
stehen, nimmt ihr Core nur 15 % Schaden — man kann ihn nicht sinnvoll angreifen. Jeder zerstörte
Knoten hebt das an, bei null Knoten trifft man voll. Ein Match hat dadurch zwei Phasen: erst die
Anlagen der Gegenseite jagen (Generatoren, Kühltürme — je drei Raketen), dann den offenen Core
erstürmen. Der Moment, in dem der Schild fällt, ist für beide Teams sichtbar und hörbar.

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
- **Teilzerstörung von Gebäuden.** Anlagen sind ganz oder gar nicht zerstört; einzelne Bauteile
  fallen noch nicht separat ab.
- **Reconnect.** Fällt die Verbindung zum Host weg, endet die Runde mit einer Meldung;
  ein erneuter Beitritt in dieselbe Sitzung ist nicht implementiert.
- **Echte Rückrechnung.** Der Host prüft Treffer gegen einen Positionsverlauf (siehe unten),
  rechnet die Welt aber nicht auf die exakte Sichtzeit des Schützen zurück. Bei sehr hohem
  Ping bleibt ein Rest Ungenauigkeit.

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

1. Rückrechnung auf die exakte Sichtzeit des Schützen statt Fensterprüfung.
2. Gebäude in mehrere abwerfbare Teile zerlegen.
3. Reconnect in eine laufende Sitzung.
4. Zweite Karte oder asymmetrische Inselvarianten.

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

---

## Erweiterungsrunde

**Granaten und Sprengladungen** (Tasten `4` und `5`) vervollständigen die Waffenliste.
Beide verhalten sich anders als alles bisherige: kein Direktschaden, sie fliegen an Gegnern
vorbei, bleiben am Boden liegen und detonieren nach Zeit. Der Zünder blinkt sichtbar.

| | Granate | Sprengladung |
|---|---|---|
| Vorrat | 3 pro Leben | 2 pro Leben |
| Zünder | 2,4 s | 4,0 s |
| Flächenschaden | 95 | 190 |
| Radius | 11 m | 15 m |
| Faktor gegen Core | 0,8 | 2,4 |

Die Sprengladung ist damit die stärkste Waffe gegen den Core — aber nur zwei Stück pro Leben,
und man muss dafür auf der gegnerischen Insel stehen. Genau die Situation aus dem
ursprünglichen Konzept: einer landet heimlich, während die anderen den Luftraum binden.

**Trefferprüfung gegen Positionsverlauf.** Bisher prüfte der Host nur Betrag und Feuerrate —
*wohin* geschossen wurde, war ihm egal. Jetzt führt er für jeden Spieler einen Verlauf der
letzten 450 ms und prüft jeden Anspruch geometrisch:

- War das Ziel in diesem Fenster jemals nah genug am behaupteten Einschlag? (9 m zu Fuß,
  30 m für Flugzeuge — genug für 20-Hz-Updates und normalen Ping)
- Kann die genannte Waffe von der Position des Schützen aus überhaupt so weit reichen?
- Liegt ein Core- oder Anlagentreffer plausibel an der Anlage?

Damit sind Ansprüche quer über die Karte oder gegen Ziele, die nie dort waren, nicht mehr
durchsetzbar. Das Fenster ist bewusst großzügig: lieber ein zweifelhafter Treffer zu viel
als ein legitimer verworfen.

**Spätzugang funktioniert.** Wer einem laufenden Match beitritt, bekommt vom Host einen
gezielten Zustands-Snapshot: Restzeit, beide Core-Werte, alle bereits zerstörten Anlagen und
das Wetter. Er steigt direkt ein statt in einer toten Lobby zu landen.

---

## Startfehler behoben

Der Ladebalken lief endlos. Ursache: ein Deko-Block auf dem Deck (Fahrbahn zum Core,
Warnstreifen vor dem Hangartor) griff auf `hangarZ` zu, stand im Quelltext aber **vor**
dessen Deklaration. In JavaScript ist das kein Fehler beim Parsen, sondern erst zur
Laufzeit — `ReferenceError: Cannot access 'hangarZ' before initialization`. `buildIsland`
brach ab, `boot()` kam nie bis zum Ausblenden des Ladebildschirms.

Der Block steht jetzt hinter der Hangar-Definition. Zusätzlich:

- **`boot()` fängt Fehler ab** und zeigt sie als Panel mit Meldung und Stacktrace an,
  statt den Balken weiterlaufen zu lassen. Ein globaler `error`-Handler greift dieselbe
  Anzeige, falls es später knallt.
- Der Fehlertext nennt die häufigsten Ursachen (CDN nicht erreichbar, kein WebGL).

**Warum das durchgerutscht ist:** Syntaxprüfung (`node --check`) findet solche Fehler
prinzipiell nicht, und ohne Browser lief nichts, was `buildIsland` tatsächlich aufruft.
Ich habe deshalb einen Testaufbau gegen einen DOM-Stub gebaut, der den kompletten
Modulgraph auswertet und jeden Aufbauschritt einzeln durchspielt — Inseln, Himmel, Wetter,
alle sechs Flugzeugvarianten, Pilot, Startplätze, Core — plus Konsistenzprüfungen
(Startplatzreihenfolge, Spawns auf begehbarer Fläche, Ausrichtung zum Gegner, erreichbare
Landegeschwindigkeit). Der Testaufbau ist nicht Teil des Auslieferungspakets, weil er
`npm install three` braucht und das Projekt bewusst ohne Build-Schritt auskommt.

---

## Neuausrichtung: warum sich das Spiel vorher tot anfühlte

Nach dem ersten Spieltest war klar, dass die Technik stand, die Spielschleife aber nicht.
Drei Diagnosen und was daraus folgte.

### 1. Die Karte war doppelt so groß wie sie sein darf

Zwischen den Inselkanten lagen 1580 Meter — bei Reisetempo über zwanzig Sekunden reines
W-Halten zwischen zwei Kampfmomenten. In einem Arcade-Luftkampf ist alles über acht Sekunden
Leerlauf tödlich für das Tempo.

`ISLAND_Z` von 900 auf 470. Der Abstand beträgt jetzt 716 Meter, und die Maschinen sind
deutlich schneller geworden:

| | Anflug (Reise / Boost) | vorher |
|---|---|---|
| Interceptor | 5,7 s / 2,4 s | 18 s / 8 s |
| Striker | 6,8 s / 2,8 s | 21 s / 9 s |
| Bomber | 9,2 s / 4,1 s | 30 s / 14 s |

### 2. Der Core war Fließbandarbeit, die Insel war Deko

1000 HP bei Faktor 0,35 für Bordkanonen sind 180 Treffer. Das ist keine Erstürmung.
Gleichzeitig hatten die zerstörbaren Anlagen **überhaupt keine Funktion** — sie explodierten
hübsch und änderten nichts.

Beides ist jetzt dasselbe System. Die fünf Anlagen sind Schildknoten:

| Zustand | Core-Schaden | Raketen bis Core zerstört |
|---|---|---|
| 5/5 Knoten stehen | 15 % | 53 |
| 2/5 zerstört | 49 % | 16 |
| alle zerstört | 100 % | 8 |

Damit hat ein Match einen Aufbau: Anlagen jagen, Schild bricht (großer sichtbarer Moment für
beide Teams), Core-Sturm. Und die Sprengladung wird zur Kronjuwelenwaffe — drei Stück bei
offenem Core reichen, aber man muss dafür zweimal auf der gegnerischen Insel landen.

### 3. Der Himmel war leer

Wer allein testet, hatte keinen Gegner, keinen Druck, keine Geschichte. Der Host füllt jetzt
beide Teams auf drei Einheiten auf — fehlende Spieler werden durch **Drohnen** ersetzt.

Sie fliegen bankend statt zu taumeln (Ausrichtung über `lookAt`, Schräglage aus der Kurvenrate),
suchen sich das nächste gegnerische Ziel, feuern nur bei sauberer Ausrichtung in Salven von
vier Schuss und treffen absichtlich nur zu 32–62 %, abhängig von der Zielgüte. Sie greifen
weder Core noch Schildknoten an: der Fortschritt bleibt Sache der Menschen, die Drohnen liefern
den Widerstand. Wer eine abschießt, bekommt sie nach sechs Sekunden wieder.

### Weitere Eingriffe am Spielgefühl

- **Abgeschossen heißt wieder in der Luft.** Wer im Flug stirbt, respawnt in einer frischen
  Maschine über der eigenen Insel statt am Hangar zu Fuß. Der lange Rückweg war der zweite
  große Tempokiller.
- **Duelle dauern jetzt lang genug, um sie zu drehen.** Vorher 0,66 s bis zum Abschuss bei
  sauberem Zielen — wer hinter dir saß, löschte dich ohne Reaktionsmöglichkeit. Jetzt 0,9 s
  (Interceptor) bis 3,9 s (Bomber), bei realistischer Trefferquote also mehrere Sekunden.
- **Treffen ist möglich geworden.** Projektilgeschwindigkeit von 560–620 auf 750–900,
  engere Streuung, und ein **Vorhaltepunkt** zeigt beim Fliegen, wohin man schießen muss.
  Ohne ihn trifft man ein querfliegendes Ziel praktisch nie.
- **Man erfährt, woher der Schuss kam.** Ein roter Bogen am Bildrand zeigt die Richtung des
  Angreifers. Vorher starb man ohne jede Information.
- **Boost knallt.** Sichtfeld +15°, deutlich mehr Kameraschütteln, Geschwindigkeitsstreifen,
  die seitlich an der Kanzel vorbeiziehen.
- **Schildstand im HUD** als Punktreihe unter beiden Core-Balken.
- Startplatz nach dem Abheben in 3 statt 7 Sekunden wieder frei.
