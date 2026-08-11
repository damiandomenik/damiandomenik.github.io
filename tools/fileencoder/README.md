# Universal File Encoder

**Turn any file into portable data.**

Drop a file in and the tool tells you what it is, how large it becomes as Base64, and whether a QR code could realistically carry it. Then it does the work: Base64, data URLs, QR codes, and everything back again.

Everything runs in the browser. No uploads, no accounts, no database.

---

## What it does

**Encode File** — Base64, data URL or QR code, with a live analysis first. Multiple files at once, optionally zipped into one archive before encoding.

**Decode Base64** — paste Base64 or a data URL and get the file back. The type is read from the decoded bytes, so a mislabelled data URL is caught.

**QR Tools** — generate a code from text or a small file, and read one back from an image or the camera.

**File Analysis** — everything the analysis knows, without encoding anything. Only the first 4 KB of each file is read, so dropping a 4 GB video costs nothing.

---

## The part that matters: QR codes are small

A QR code holds **2,953 bytes**. That is the absolute maximum — version 40, error correction level L, byte mode — and it is not a lot. Roughly one page of text.

Most "file to QR" tools generate a code for whatever you give them and let the scanner fail later. This one computes the real payload against the real capacity table from ISO/IEC 18004:

```
QR capacity                                   🔴 Too large for QR
├────────────────────────────────────────────────────────────┤
0                          2953 bytes — the largest QR code there is

The payload comes to 3.2 MB. The largest QR code that exists holds
2.9 KB — this is about 1137× over. For this file the largest that
would fit is roughly 2.1 KB.
```

The payload includes the envelope, which is not free:

```json
{"v":1,"n":"hello.txt","m":"text/plain","e":"b64","d":"aGVsbG8="}
```

Short keys are not a style choice — at 2,953 bytes total, spelling out `"filename"` instead of `"n"` costs bytes that the file then cannot have.

Three verdicts, each with a reason:

| | |
|---|---|
| 🟢 **QR ready** | Fits at a comfortable density. Scanning works off a screen or a printout. |
| 🟡 **Possible, not recommended** | Only fits above version 20. The modules are tiny: off a screen it usually works, off paper often not, and any smudge loses the file. |
| 🔴 **Too large** | Does not fit in any QR code that exists. The tool says by how much, and what size would fit. |

The test suite asserts that the verdict never contradicts the capacity table, across a thousand file sizes.

---

## Other things done carefully

**The file type is read from the bytes**, not the extension. A JPEG renamed to `.png` is identified as a JPEG and the mismatch is flagged — anyone can rename a file, so the name is a claim and the bytes are the fact. ZIP-based formats are opened far enough to tell a `.docx` from a `.xlsx` from a plain archive.

**Base64 is chunked on multiples of three.** `btoa(String.fromCharCode(...bytes))` overflows the call stack somewhere around a hundred thousand bytes, so everything runs in chunks — and the chunk size is divisible by three, because Base64 encodes three bytes into four characters. Splitting anywhere else makes `btoa` pad the middle of the string and the result decodes to something different. The tests check every boundary case against a known-good encoder.

**Large output never reaches the DOM in full.** A 50 MB file becomes a 67 MB string; rendering that would freeze the tab for seconds. Only the first 100,000 characters are shown, with the rest still available to copy or download. Above 100 MB the tool declines to encode at all and says why, rather than crashing the tab.

**Decoding is forgiving about input and specific about failure.** Missing padding, whitespace, URL-safe alphabets and data URLs all work. What does not work gets a real explanation — "it contains `!`, which never appears in Base64 data" rather than "invalid input".

**Scanned payloads are treated as hostile.** Everything from a camera is validated: version, encoding, Base64 alphabet, and the filename has its path stripped, so a payload claiming to be `../../etc/passwd` downloads as `passwd`.

---

## Running it

Static HTML, CSS and ES modules. No build step.

```bash
python3 -m http.server 8080     # from this folder
```

Then open `http://localhost:8080`. ES modules need `http://` — opening `index.html` from the file system will not work.

Deploying is copying the folder. It is part of the `tools/` site at `…/tools/fileencoder/`.

```bash
node test/all.js       # 115 assertions
npm install jsdom      # optional, adds the view suite
```

---

## Structure

```
fileencoder/
├── index.html
├── css/style.css
└── js/
    ├── main.js          routing and the shell
    ├── state.js         files staged between views (memory only)
    ├── ui.js            DOM helpers, drag & drop, downloads; no innerHTML
    ├── sniff.js         file type from magic bytes
    ├── encode.js        chunked Base64, data URLs, decoding
    ├── qr.js            the real capacity table, payload format, generate & read
    ├── advise.js        "what makes sense for this file"
    ├── report.js        the analysis card and the capacity gauge
    └── views/           one file per section
```

---

## Libraries

Three, from a CDN, all of them code rather than services — no file is ever sent anywhere.

| Library | For |
|---|---|
| qrcode-generator | Generating codes. Its HTML-string output is ignored; the SVG is built with DOM calls so no `innerHTML` is involved. |
| jsQR | Reading codes where the browser has no `BarcodeDetector` — which means Firefox. |
| JSZip | Bundling several files into one archive before encoding. |

If one fails to load, the feature that needs it says so instead of offering a dead button.

---

## Known limits

**Very large files are refused, not attempted.** Above 100 MB, encoding would need the file plus a string roughly 1.4× its size in memory at once. Browsers usually die first. The tool says so rather than freezing.

**QR reading needs a reader.** Chrome, Edge, Safari and Android browsers have `BarcodeDetector` built in. Firefox does not, so jsQR fills in — and if that failed to load, the section says reading is unavailable rather than offering a button that does nothing.

**Camera scanning needs HTTPS.** `getUserMedia` only works in a secure context. On GitHub Pages that is automatic; locally, `localhost` counts as secure but a LAN IP does not.

**PDFs are not previewed.** Rendering an arbitrary PDF from decoded data means running a full renderer over untrusted input. Download it and open it in something you trust.

**Nothing is remembered.** Reload and everything is gone — no storage, deliberately. A staged file is your data, and the promise is that it stays in the tab.
