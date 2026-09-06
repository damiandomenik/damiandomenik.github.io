# lang/ — language practice

Static, client-side language practice for the `tools/` site. Drop this folder in as
`tools/lang/`. No build step, no dependencies, no backend.

```
tools/lang/
├── index.html          language picker (entry point)
├── README.md
└── zh/                 Chinese — HSK 1–4
    ├── index.html      app shell
    ├── assets/
    │   ├── app.css     design tokens + all component styles
    │   ├── main.js     hash router, navigation, shell
    │   ├── state.js    localStorage, XP, streak, SRS, achievements, export/import
    │   ├── session.js  exercise generation + session runner
    │   ├── views.js    overview, learn, review, vocabulary, HSK, progress
    │   ├── writer.js   character tracing canvas
    │   ├── audio.js    speech synthesis wrapper (zh-CN, with fallback)
    │   └── ui.js       DOM helpers, toasts, bars, XP burst, theme
    └── data/
        ├── hsk1.js … hsk4.js         raw vocabulary rows
        ├── vocab.js                  expands rows, search, pinyin helpers
        ├── grammar.js                grammar points, sentences, tone sets
        └── rules.js                  reading rules per level + gap-fill bank
```

## Linking it from the tools hub

Already done: `tools/assets/hub.js` in this drop is your current hub file with one extra
entry (`id: 'lang'`, `href: './lang/'`) added to the TOOLS array. Nothing else on the hub
page changes. If you have edited hub.js since, copy just that entry across instead of
overwriting the file.

## Word lists

HSK 1, 2 and 3 hold the complete word lists of the HSK 2.0 standard (153 / 150 / 300).
HSK 4 holds 442 of the roughly 600 words in that level — a curated high-frequency
selection, extendable by appending rows. Published versions of these lists differ by a
handful of entries, so treat the counts as close rather than canonical.

## Rules and gap-fill

`data/rules.js` holds 45 rule write-ups grouped by topic (sound and tones, word order,
particles, verbs and complements, linking ideas) and 50 gap-fill sentences. Rules with a
`check` block can be quizzed; the rest are reading only.

## Adding vocabulary

Each row in `data/hsk1.js`, `hsk2.js`, `hsk3.js` is:

```js
[ hanzi, pinyin, meaningEn, meaningDe, category, example, examplePinyin, exampleTranslation ]
```

Append rows anywhere in the array — ids (`hsk1-001`, …) are generated from position, so
adding to the end keeps existing progress intact. Categories must be keys of
`CATEGORY_LABELS` in `data/vocab.js`; add new ones there first.

Grammar points, sentence-builder sentences and tone minimal pairs live in
`data/grammar.js` in the same self-describing shape.

## Data and privacy

Progress is a single localStorage key (`chineselab.v1`) holding XP, streak, per-word
review scheduling, skill accuracy and achievements. Export writes that object to a JSON
file; import replaces it. Reset deletes the key. Nothing is sent anywhere and there is no
analytics or external font/script request.

Audio uses the browser's own `speechSynthesis`. If no Chinese voice is installed, speaker
buttons say so and the listening mode is disabled rather than mispronouncing everything.
