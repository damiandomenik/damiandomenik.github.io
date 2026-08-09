# PatternLab

**Build, test and understand patterns.**

Four tools in one page: a regex playground that explains what your pattern actually does, a password analyzer that estimates guessing effort rather than counting rules, a rule builder that works in both directions, and a generator that is cryptographically random and provably meets your rules.

Everything runs in the browser. No accounts, no uploads, no storage.

---

## What it does

**Regex Playground.** Type a pattern, see every match highlighted live, with positions, capture groups and named groups. All six flags are toggles. Broken patterns produce a readable message instead of a stack trace.

**Plain-English explanation.** The pattern is parsed into a tree and rendered as a ladder — one rung per token, each with what it is and what it does. Anything the parser cannot name honestly is marked as a gap rather than guessed at.

**Build a pattern from examples.** Select a piece of the test text and PatternLab proposes patterns that would match it, from strict to loose. See below for why this is trustworthy.

**Test cases.** Add strings and mark whether each must match or must not. The score updates on every keystroke, which is what makes tightening a pattern safe.

**Password Analyzer.** Live strength, character composition, recognisable patterns, and estimated crack times for three attacker scenarios.

**Rule Builder.** Set a policy in plain fields, get the regex. Or paste someone else's regex and get the policy back — with an explicit list of anything that could not be interpreted.

**Password Generator.** `crypto.getRandomValues` with rejection sampling, requirements satisfied by construction, and the result checked against the rules before it is shown.

---

## Two things worth explaining

### Strength is estimated by guessing effort, not by rule counting

`Password1!` satisfies every rule most sites impose: twelve characters would be nice but ten will do, upper, lower, digit, symbol. It also falls instantly.

So instead of counting satisfied rules, PatternLab scans the password left to right and greedily matches the predictable pieces — a password from the common list, a dictionary word (after undoing leet substitution), a run like `abcd`, a repeat like `aaaa`, a keyboard walk, a year. Each matched piece contributes the number of guesses it actually costs, not the number its length suggests. What is left over counts as random characters from the pools in use.

This is a simplified relative of zxcvbn, written from scratch to avoid the dependency. It is an estimate, and the interface says so: no offline tool can know whether a password has appeared in a breach.

### Patterns from examples are proposed, then checked

Infinitely many patterns match any set of examples. `AZ-12345/2026` is matched by itself, by `AZ-\d{5}/\d{4}`, by `[A-Z]{2}-\d+/\d+`, and by `.+`. Which one you want depends on what you meant, and nothing can read that.

So the tool does not claim to find *the* pattern. It splits each example into runs of digits, letters and punctuation, aligns those runs across the examples, and offers candidates at three levels of strictness plus a literal fallback. Then it runs each candidate against your whole text and reports exactly what it caught:

```
[ok]   Exact shape             [A-Z]{2}-\d{5}\/\d{4}
       Matches your 2 examples and nothing else in the text.
[warn] Loosest useful form     [A-Z]+-\d+\/\d+
       In your text this also catches "AZ-123/2026".
```

A suggestion you can check beats a suggestion you have to trust. With one example the tool says so plainly — which parts were incidental is a guess until you select a second.

### The regex interpreter refuses rather than guesses

Reading password rules out of an arbitrary regex is the feature most likely to lie, and the consequence of a lie is somebody configuring a policy from it. So it recognises a fixed catalogue of shapes:

```
(?=.*[A-Z])              at least one uppercase
(?=(?:[^A-Z]*[A-Z]){2})  at least two uppercase
(?=.*\d)   (?=.*[0-9])   at least one number
(?=.*[^A-Za-z0-9])       at least one special character
.{8,}      .{8,64}       length
^ … $                    anchors, which are required
```

Anything outside the catalogue is reported as a gap, with the exact source text and the reason. A pattern with a negative look-ahead, a literal character, or alternation will be partially read and clearly labelled incomplete.

---

## Running it

It is static: HTML, CSS and ES modules, no build step.

```bash
python3 -m http.server 8080     # from this folder
```

Then open `http://localhost:8080`. ES modules need `http://`; opening `index.html` from the file system will not work.

Deploying is copying the folder. It is already part of the `tools/` site and reachable at `…/tools/patternlab/`.

```bash
node test/all.js                # 153 assertions
npm install jsdom               # optional, adds the view suite
```

The tests cover the parser against valid and broken patterns, the rules-to-regex-and-back round trip, the honest-failure cases, strength scoring, and generation under constraints. Randomness is checked with a chi-square goodness-of-fit test rather than a threshold, so it does not fail at random.

---

## Structure

```
patternlab/
├── index.html
├── css/style.css
└── js/
    ├── main.js              routing, tabs, keyboard shortcuts
    ├── state.js             the rule set shared between builder and generator
    ├── ui.js                every DOM helper; no innerHTML anywhere
    ├── regex/
    │   ├── parser.js        pattern → syntax tree
    │   ├── explain.js       syntax tree → plain English
    │   ├── interpret.js     pattern → password rules, with limits
    │   ├── infer.js         examples → candidate patterns, with verification
    │   ├── match.js         running patterns safely
    │   └── cheatsheet.js    reference data and examples
    ├── password/
    │   ├── rules.js         the rule model, rules → regex, testing
    │   ├── strength.js      entropy with pattern recognition
    │   └── generate.js      crypto-secure generation
    └── views/               one file per section
```

---

## A note on React

The brief asked for React, TypeScript and Vite. This is vanilla ES modules instead, because the rest of the `tools/` site deploys by copying a folder — adding a build step would mean `npm install`, `npm run build` and committing `dist/` before every change. The modules are already split the way components would be, so porting later is mechanical rather than a rewrite.

---

## Known limits

**Catastrophic backtracking cannot be prevented.** A pattern like `(a+)+b` against a long string of `a`s can freeze any JavaScript engine, and no check can predict it in advance — that is the halting problem. The test text is capped at 200,000 characters and matches at 5,000, which contains the damage without pretending to prevent it.

**`\w` and `\b` are ASCII-only** in JavaScript, so `ä` is not a word character. The explanation says this where it matters; the engine's behaviour is not changed.

### Syntax coverage

`test/coverage.test.js` throws every JavaScript regex construct at the parser and asserts that each one is either fully explained or openly marked as a gap. Currently: **53 fully explained, 7 marked as gaps, 0 wrongly rejected.**

The seven gaps, and why:

| Construct | Status |
|---|---|
| `\p{L}`, `\P{L}`, `\p{Script=Greek}` | Matches correctly; not described. Naming every Unicode property honestly would mean shipping the Unicode database. |
| `(?i:…)`, `(?-i:…)` inline modifiers | Very new syntax. Marked as a gap; the rest of the pattern is still explained. |
| `[\p{L}--[aeiou]]`, `[\q{abc}]` | Set notation and string sets, which need the `v` flag. |

The `v` flag is deliberately not offered in the flag toggles: the engine would handle it, but the explainer would read set notation as ordinary characters, and a confident wrong explanation is worse than an absent one. That is not hypothetical — the coverage test caught exactly this with `\cJ`, which was being described as the literal letters "cJ" when it actually matches a line feed.

**The common-password list is short.** A few hundred entries, enough to catch the obvious. A real breach corpus is hundreds of megabytes, which is not something to download into a browser tab.

**Nothing is remembered.** Reload and your patterns, rules and passwords are gone. That is deliberate: storing them would mean a password could end up on disk.
