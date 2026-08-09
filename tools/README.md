# tools/

Statischer Tool-Bereich für deine GitHub-Pages-Seite. Landing-Page im Terminal-Look,
darunter jedes Tool als eigener Unterordner. Erstes Tool: die **PDF Toolbox**.

Alles läuft ausschließlich im Browser. Kein Backend, keine Datenbank, kein Upload.

---

## 1. Projektstruktur

```
tools/
├── index.html              Landing-Page (Tool-Hub, Terminal-Look)
├── assets/
│   ├── hub.css             Styles der Landing-Page
│   └── hub.js              Tool-Registry + Command-Bar
├── README.md
├── exifcleaner/            Tool 2: EXIF Cleaner
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── main.js         Ablauf: lesen → analysieren → säubern → verifizieren
│   │   ├── ui.js           gesamtes DOM-Rendering
│   │   ├── exif.js         eigener Parser (JPEG-Segmente, TIFF-IFDs, PNG-/RIFF-Chunks)
│   │   ├── strip.js        verlustfreies Entfernen je Format
│   │   ├── tags.js         Tag-Wörterbuch + Risikobewertung
│   │   └── geocode.js      optionale Adress-Suche via Nominatim
│   └── test/               106 Tests: node test/all.js
└── pdftoolbox/             Tool 1: PDF Toolbox
    ├── index.html          App-Shell, lädt die CDN-Libraries
    ├── css/
    │   └── style.css
    └── js/
        ├── main.js         Hash-Router, Bootstrap, globales Error-Handling
        ├── routes.js       Registry der Tools (nur Daten)
        ├── ui.js           DOM-Helfer, Toasts, Progress-Overlay, Dialoge
        ├── files.js        Dateiauswahl, Dropzone, Validierung, Download, URL-Pool
        ├── load.js         PDF laden inkl. Passwort-Abfrage
        ├── pdf-engine.js   ALLE Aufrufe von pdf.js und pdf-lib
        ├── composer.js     Dokumentmodell (Seitenliste + Quellen-Registry)
        ├── components/
        │   ├── pagegrid.js Thumbnail-Board: Auswahl, Drag-Reorder, Lazy-Rendering
        │   └── filelist.js sortierbare Dateiliste
        └── views/
            ├── home.js
            ├── merge.js
            ├── workspace.js       gemeinsamer Seiten-Editor
            ├── organize.js        \
            ├── split.js            > dünne Konfigurationen von workspace.js
            ├── rotate.js          /
            ├── builder.js         /
            ├── images-to-pdf.js
            └── pdf-to-images.js
```

**Trennung:** `ui.js`/`components/`/`views/` kennen keine PDF-Internals.
`pdf-engine.js` ist die einzige Datei, die pdf.js und pdf-lib anfasst.
`composer.js` hält den Zustand. `files.js` macht File-Handling.

Die vier Tools *organize / split / rotate / build* sind bewusst derselbe Editor
(`workspace.js`) mit unterschiedlich freigeschalteten Controls – so verhält sich
Sortieren, Auswählen und Drehen überall identisch.

---

## 2. Lokal starten

ES-Module brauchen `http://`, ein Doppelklick auf die `index.html` (`file://`)
funktioniert **nicht**. Ein beliebiger statischer Server reicht:

```bash
cd tools
python3 -m http.server 8080
# oder: npx serve .
```

Dann `http://localhost:8080/` öffnen. Kein Build-Schritt, kein npm install.

---

## 3. Auf GitHub Pages veröffentlichen

1. Ordner `tools/` in dein Pages-Repo legen (z. B. `username.github.io/tools/`).
2. Commit + Push.
3. In den Repo-Settings unter *Pages* die Quelle (Branch, meist `main`, Ordner `/`) setzen.
4. Erreichbar unter `https://username.github.io/tools/`, die einzelnen Tools unter
   `.../tools/pdftoolbox/` bzw. `.../tools/exifcleaner/`.

Alle Pfade sind relativ (`./pdftoolbox/`, `../`), es funktioniert also auch in einem
Projekt-Repo unter `username.github.io/repo-name/tools/`.

Falls dein Repo Dateien oder Ordner mit führendem Unterstrich bekommt: eine leere
Datei `.nojekyll` ins Repo-Root legen, damit Jekyll nichts wegfiltert. Für diese
Struktur ist das nicht nötig.

**Ein neues Tool ergänzen:** Ordner `tools/dein-tool/` anlegen und einen Eintrag in
`assets/hub.js` → `TOOLS` hinzufügen. Sonst nichts.

**Ein Tool umbenennen:** Ordner umbenennen und das passende `href` in
`assets/hub.js` anpassen. Das sind die einzigen zwei Stellen — innerhalb eines
Tools sind alle Pfade relativ, und der Rücklink `../` stimmt unabhängig vom
Ordnernamen.

---

## 4. Verwendete Libraries

| Library | Version | Wofür | Warum |
|---|---|---|---|
| [pdf.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | PDFs parsen und Seiten rendern | Der einzige ausgereifte PDF-Renderer für den Browser; liefert Thumbnails, die Vorschau und PDF→Bilder. Läuft in einem eigenen Web Worker, das hält die UI flüssig. |
| [pdf-lib](https://pdf-lib.js.org/) | 1.17.1 | PDFs erzeugen und verändern | pdf.js kann nur lesen. pdf-lib schreibt: Seiten kopieren, drehen, löschen, Bilder einbetten – ohne Server. |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | ZIP-Archive im Speicher | Nötig, sobald ein Vorgang mehrere Dateien erzeugt (alle Seiten als Bilder, „jede Seite als eigene PDF"). Browser blockieren sonst Mehrfach-Downloads. |

Die drei Dateien kommen von cdnjs. Das ist die **einzige** Netzwerkverbindung der App —
deine Dokumente sind an keinem Request beteiligt. Wenn du auch das vermeiden willst:
Dateien herunterladen, nach `pdf/vendor/` legen und die vier Pfade in
`pdf/index.html` sowie `workerSrc` in `pdf-engine.js` anpassen. Danach läuft die App
komplett offline.

---

## 5. Bekannte Browser-Limitierungen

**Passwortgeschützte PDFs.** pdf.js kann sie mit Passwort *lesen*, pdf-lib kann sie
nicht *schreiben* – die Inhalts-Streams bleiben verschlüsselt, das Ergebnis wäre kaputt.
`ignoreEncryption` wird deshalb bewusst nicht verwendet. Die App sagt das klar und
schlägt den einzigen sauberen Weg vor: PDF→Bilder (mit Passwort) und die Bilder wieder
zu einer PDF zusammenbauen. Der Text wird dabei zu Pixeln.

**Bildformate in PDF.** Das PDF-Format kennt nur JPEG- und PNG-Bilddaten. WebP wird
darum beim Export über ein Canvas neu kodiert (Standard: JPEG; PNG wählbar, wenn
Transparenz erhalten bleiben soll). Das kostet etwas Qualität bzw. Dateigröße.

**Arbeitsspeicher.** Eine A4-Seite bei 300 dpi ist ~2480×3508 px ≈ 35 MB als
Canvas-Rohdaten. Sehr große PDFs oder viele Seiten bei hoher DPI können den Tab
sprengen; iOS-Safari hat das engste Limit (grob 200–400 MB pro Tab). Die App rendert
deshalb nur sichtbare Thumbnails, exportiert Seite für Seite und gibt Canvases sofort frei.
Bei >30 Seiten ab 300 dpi warnt sie vorher.

**Doppelte Datenhaltung beim Laden.** pdf.js überträgt den übergebenen Buffer an seinen
Worker und „detached" ihn dabei. Deshalb bekommt pdf.js eine Kopie und pdf-lib das
Original — eine PDF liegt beim Bearbeiten also zweimal im Speicher. Anders geht es mit
beiden Libraries gleichzeitig nicht.

**Drag & Drop.** HTML5-Drag funktioniert auf Touch-Geräten nicht zuverlässig. Deshalb hat
jede Seite und jede Zeile zusätzlich `‹ ›` bzw. `↑ ↓` Buttons; auf schmalen Displays sind
die Buttons dauerhaft sichtbar.

**Keine Ordner-Uploads, keine Zwischenspeicherung.** Ein Reload verwirft alles (die App
fragt vorher nach). Das ist Absicht: nichts wird persistiert.

**Was hier bewusst fehlt.** Echte Kompression („PDF verkleinern") und OCR sind mit
pdf-lib nicht seriös machbar — pdf-lib strukturiert nur um, es re-encodet keine
eingebetteten Bilder. Ein „Komprimieren"-Button, der 2 % spart, wäre eine Attrappe.

---

## 6. Später: Word → PDF

Die Architektur ist dafür vorbereitet: Ein neues Format ist ein neuer Quelltyp im
`Composer` (`type: 'docx'`) plus ein Zweig in `buildPdf()`. Praktisch geht das
client-side über [mammoth.js](https://github.com/mwilliamson/mammoth.js) (docx → HTML)
und anschließendes Rendern; layouttreu wird es nicht, das sollte man Nutzern sagen.
An `views/`, `ui.js` und `components/` muss dafür nichts geändert werden.
