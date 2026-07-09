# Message Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full compose/reply editor to the QWK Mobile app — Private/Quote pre-prompts, native editing, a Save/Kill/Edit flow, a New Message entry point, inline saved-reply editing, and a correctness-critical sanitize → wrap → tag-line pipeline that runs before a message is packed into a `.REP`.

**Architecture:** All correctness-critical text logic is implemented as **pure, Node-testable modules** under `src/qwk/` (sanitize, wrap, quote, tagline) and composed into a `finalizeReplyBody` step in the existing Outbox → `.REP` pipeline (`repBuilder.ts` → `writeRep`). The on-wire packet format is unchanged; only the finalized body text differs. React Native **screen wiring** (ComposeScreen, a pre-compose options modal, an area picker, Reader inline replies) is layered on top and — because this repo has **no RN component test harness yet** (`jest` is Node-only; `jest-expo` is deferred) — is verified with `npm run typecheck` plus explicit manual steps, never fake unit tests.

**Tech Stack:** TypeScript, React Native 0.86 / Expo ~57, `@react-navigation/native-stack`, Zustand store, `fflate` (zip), Jest 30 (Node env, `babel-jest`).

## Global Constraints

- **Node-testable purity:** modules under `src/qwk/` MUST NOT import from `react-native`, `expo-*`, or the store — they are tested in Jest's `node` environment via `babel-jest`. Anything touching `Platform`/version/AsyncStorage lives in `src/store/` or `src/appMeta.ts` and is not unit-tested.
- **Line width:** classic boards expect **≤ 79 columns**; hard-wrap at width `79`.
- **Idempotency:** building the same drafts must yield **byte-identical** `.REP` bytes (server de-dupes retries). The tag line is applied at build time only and MUST NOT be persisted into `Draft.body` (so it can never double-stamp).
- **Sanitizer policy:** transliterate common autocorrect injections to ASCII and strip control/zero-width chars; **leave other non-ASCII intact** so `writeRep`'s existing CP437-vs-UTF-8 (`Utf8` HEADERS.DAT) path still decides encoding.
- **Tag line format (verbatim):** `--- ViSiON QWK Editor v<version> (<iOS|Android>)`. `<version>` read from `src/appMeta.ts` (kept in sync with `app.json`), `<platform>` from `Platform.OS` — **never** from the `settings.platform` demo toggle.
- **Quote convention is provisional:** the attribution wording and initials rule in `quote.ts` are a concrete default flagged **"confirm against `vision-3-bbs`"**; keep them as small, easily-swapped constants/functions.
- **Test runner:** single file `npx jest <path>`; full suite `npm test`; types `npm run typecheck`.
- **Commit style:** Conventional Commits (`feat:`, `refactor:`, `test:`, `docs:`), atomic per task.

**Spec:** [`docs/superpowers/specs/2026-07-09-message-editor-design.md`](../specs/2026-07-09-message-editor-design.md)

---

## File structure

**New (pure, tested):**
- `src/qwk/sanitize.ts` + `sanitize.test.ts` — Unicode normalization.
- `src/qwk/wrap.ts` + `wrap.test.ts` — 79-col word wrap with optional prefix.
- `src/qwk/quote.ts` + `quote.test.ts` — quoted-block builder + initials.
- `src/store/draftSelectors.ts` + `draftSelectors.test.ts` — `draftsForMessage`.

**New (pure formatting, tested) + impure wrapper (not tested):**
- `src/qwk/tagline.ts` + `tagline.test.ts` — `formatTagline` / `appendTagline`.
- `src/appMeta.ts` — `APP_VERSION` constant.
- `src/store/appTagline.ts` — `currentTagline()` (reads `Platform`, not tested).

**New (RN screens/components, typecheck + manual):**
- `src/screens/ComposeOptionsScreen.tsx` — Private/Quote pre-compose modal.
- `src/screens/AreaPickerScreen.tsx` — choose a target area for New Message.

**Modified:**
- `src/store/repBuilder.ts` — add `finalizeReplyBody`; thread `tagline` param.
- `src/store/net.ts` — thread `tagline` through `pushDrafts`.
- `src/store/useStore.ts` — `updateDraft`; re-export `draftsForMessage`; pass `currentTagline()` at REP build sites.
- `src/navigation/types.ts` — extend `Compose` params; add `ComposeOptions`, `AreaPicker`.
- `src/navigation/RootNavigator.tsx` — register the two new screens.
- `src/screens/ComposeScreen.tsx` — modes, editable To/Subject in new mode, save-options prompt, empty guard, seeded body, edit-existing-draft, `<BBSID>.REP` confirmation.
- `src/screens/ReaderScreen.tsx` — route reply through options modal; render inline saved replies with tap-to-edit.
- `src/screens/MessagesScreen.tsx` — `＋ New` entry point.

**Unchanged:** `src/qwk/rep.ts`, `headers.ts`, `cp437.ts`, `utf8.ts`.

---

## Task 1: Tag-line formatting module

**Files:**
- Create: `src/qwk/tagline.ts`
- Test: `src/qwk/tagline.test.ts`

**Interfaces:**
- Produces: `formatTagline(version: string, platform: 'iOS' | 'Android'): string`; `appendTagline(body: string, tagline: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/qwk/tagline.test.ts`:

```ts
import { formatTagline, appendTagline } from './tagline';

describe('formatTagline', () => {
  it('renders the verbatim tearline', () => {
    expect(formatTagline('0.1.0', 'iOS')).toBe('--- ViSiON QWK Editor v0.1.0 (iOS)');
    expect(formatTagline('1.2.3', 'Android')).toBe('--- ViSiON QWK Editor v1.2.3 (Android)');
  });
});

describe('appendTagline', () => {
  const tag = '--- ViSiON QWK Editor v0.1.0 (iOS)';

  it('appends after exactly one blank line', () => {
    expect(appendTagline('Hello world', tag)).toBe(`Hello world\n\n${tag}`);
  });

  it('collapses trailing newlines to a single blank-line separator', () => {
    expect(appendTagline('Hello\n\n\n', tag)).toBe(`Hello\n\n${tag}`);
  });

  it('returns just the tagline for an empty body', () => {
    expect(appendTagline('', tag)).toBe(tag);
  });

  it('is a no-op when the tagline is empty (keeps existing bytes stable)', () => {
    expect(appendTagline('Hello', '')).toBe('Hello');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/qwk/tagline.test.ts`
Expected: FAIL — cannot find module `./tagline`.

- [ ] **Step 3: Write the implementation**

Create `src/qwk/tagline.ts`:

```ts
/**
 * Reader tag line, appended tearline-style to every composed message so readers
 * on any board can see which client produced it. Pure/deterministic — the
 * version/platform values are resolved by the caller (see store/appTagline.ts).
 */

/** `--- ViSiON QWK Editor v<version> (<platform>)`. */
export function formatTagline(version: string, platform: 'iOS' | 'Android'): string {
  return `--- ViSiON QWK Editor v${version} (${platform})`;
}

/**
 * Append `tagline` as the final line of `body`, separated by exactly one blank
 * line. Trailing newlines on `body` are collapsed first so spacing is always a
 * single blank line. An empty tagline is a no-op (keeps re-upload bytes stable);
 * an empty body yields just the tagline.
 */
export function appendTagline(body: string, tagline: string): string {
  if (!tagline) return body;
  const trimmed = body.replace(/\n+$/, '');
  return trimmed.length === 0 ? tagline : `${trimmed}\n\n${tagline}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/qwk/tagline.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/qwk/tagline.ts src/qwk/tagline.test.ts
git commit -m "feat(editor): reader tag line formatting"
```

---

## Task 2: Unicode sanitizer

**Files:**
- Create: `src/qwk/sanitize.ts`
- Test: `src/qwk/sanitize.test.ts`

**Interfaces:**
- Produces: `sanitizeBody(text: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/qwk/sanitize.test.ts`:

```ts
import { sanitizeBody } from './sanitize';

// Inputs use \uXXXX escapes so this file stays pure ASCII and nothing is lost
// on paste. They are valid JS string escapes (they yield the real characters at
// runtime). Do NOT replace them with literal glyphs.
const SMART = '\u2018a\u2019 \u201Cb\u201D'; // curly 'a' "b"
const EM = 'a\u2014b';        // em dash
const EN = 'a\u2013b';        // en dash
const ELLIPSIS = 'a\u2026';    // ellipsis
const NBSP = 'a\u00A0b';      // non-breaking space
const NNBSP = 'a\u202Fb';     // narrow no-break space
const ZERO_WIDTH = 'a\u200Bb\uFEFFc\u200Dd'; // ZWSP, BOM, ZWJ
const BEL = 'a\u0007bc\nd'; // BEL control char + newline
const INTENDED = 'caf\u00E9 \u263A \u2554\u2550\u2557'; // cafe + smiley + box

describe('sanitizeBody', () => {
  it('transliterates smart quotes to ASCII', () => {
    expect(sanitizeBody(SMART)).toBe("'a' \"b\"");
  });

  it('transliterates dashes and ellipsis', () => {
    expect(sanitizeBody(EM)).toBe('a--b');
    expect(sanitizeBody(EN)).toBe('a-b');
    expect(sanitizeBody(ELLIPSIS)).toBe('a...');
  });

  it('converts non-breaking spaces and tabs to a regular space', () => {
    expect(sanitizeBody(NBSP)).toBe('a b');
    expect(sanitizeBody(NNBSP)).toBe('a b');
    expect(sanitizeBody('a\tb')).toBe('a b');
  });

  it('strips zero-width characters and the BOM', () => {
    expect(sanitizeBody(ZERO_WIDTH)).toBe('abcd');
  });

  it('strips control characters but keeps newlines', () => {
    expect(sanitizeBody(BEL)).toBe('abc\nd');
  });

  it('normalizes CRLF and CR to LF', () => {
    expect(sanitizeBody('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('leaves genuinely-intended non-ASCII intact (UTF-8 path handles it)', () => {
    expect(sanitizeBody(INTENDED)).toBe(INTENDED);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/qwk/sanitize.test.ts`
Expected: FAIL — cannot find module `./sanitize`.

- [ ] **Step 3: Write the implementation**

Create `src/qwk/sanitize.ts`:

```ts
/**
 * Normalize composed text before it is packed into a .REP. Mobile keyboards
 * inject non-ASCII typographic characters (smart quotes, em dashes, NBSP) and
 * invisible control/zero-width characters via autocorrect/predictive text that
 * corrupt classic ASCII/CP437 boards. Transliterate the common ones to ASCII and
 * strip the invisible ones; leave other non-ASCII intact so writeRep's CP437 /
 * UTF-8 (HEADERS.DAT `Utf8`) fallback still decides the encoding.
 *
 * Target characters are written as \uXXXX escapes on purpose (valid in JS
 * regex and strings). Do not replace them with literal glyphs; invisible bytes
 * do not survive edits.
 */

// Typographic characters -> ASCII equivalents.
const TRANSLITERATE: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201A\u201B]/g, "'"], // smart single quotes / low-9
  [/[\u201C\u201D\u201E\u201F]/g, '"'], // smart double quotes / low-9
  [/\u2014/g, '--'],                    // em dash
  [/[\u2013\u2012\u2212]/g, '-'], // en / figure / minus dash
  [/\u2026/g, '...'],                  // horizontal ellipsis
  [/[\u00A0\u202F]/g, ' '],      // NBSP / narrow NBSP
  [/\u2022/g, '*'],                   // bullet
];

// Zero-width characters + BOM (invisible; break word counting and diffs).
const ZERO_WIDTH = /[\u200B\u200C\u200D\u2060\uFEFF]/g;

// C0 controls (excludes \u0009 tab, \u000A LF, \u000D CR) plus C1 controls.
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function sanitizeBody(text: string): string {
  let out = text;
  for (const [re, sub] of TRANSLITERATE) out = out.replace(re, sub);
  out = out.replace(/\t/g, ' ');       // tab -> single space (deterministic width)
  out = out.replace(ZERO_WIDTH, '');
  out = out.replace(/\r\n?/g, '\n');   // CRLF / CR -> LF before stripping controls
  out = out.replace(CONTROLS, '');     // drop remaining controls; LF already safe
  return out;
}
```

> Note: `CONTROLS` excludes `\u0009` (tab), `\u000A` (LF), and `\u000D` (CR)
> -- tabs are converted to spaces and CR/LF normalized before this strip runs,
> so real spacing and line breaks survive.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/qwk/sanitize.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/qwk/sanitize.ts src/qwk/sanitize.test.ts
git commit -m "feat(editor): sanitize composed text for classic boards"
```

---

## Task 3: 79-column word wrap

**Files:**
- Create: `src/qwk/wrap.ts`
- Test: `src/qwk/wrap.test.ts`

**Interfaces:**
- Produces: `wrapText(text: string, width?: number, prefix?: string): string` (defaults `width = 79`, `prefix = ''`).

- [ ] **Step 1: Write the failing test**

Create `src/qwk/wrap.test.ts`:

```ts
import { wrapText } from './wrap';

const longestLine = (s: string) => Math.max(...s.split('\n').map((l) => l.length));

describe('wrapText', () => {
  it('keeps short lines unchanged', () => {
    expect(wrapText('hello world', 79)).toBe('hello world');
  });

  it('wraps on word boundaries at the width', () => {
    const words = Array(20).fill('word').join(' '); // 20 * 5 - 1 = 99 chars
    const out = wrapText(words, 79);
    expect(longestLine(out)).toBeLessThanOrEqual(79);
    expect(out).toContain('\n');
    // no word is split
    for (const line of out.split('\n')) expect(line).toMatch(/^(word ?)+$/);
  });

  it('hard-breaks a single over-long token', () => {
    const out = wrapText('x'.repeat(200), 79);
    expect(longestLine(out)).toBeLessThanOrEqual(79);
    expect(out.replace(/\n/g, '')).toBe('x'.repeat(200));
  });

  it('preserves blank lines between paragraphs', () => {
    expect(wrapText('a\n\nb', 79)).toBe('a\n\nb');
  });

  it('applies a prefix that counts toward the width', () => {
    // width 8, prefix "> " (2) -> 6 usable. "aaaa" fits, "+bbbb" would be 9 -> wrap.
    expect(wrapText('aaaa bbbb', 8, '> ')).toBe('> aaaa\n> bbbb');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/qwk/wrap.test.ts`
Expected: FAIL — cannot find module `./wrap`.

- [ ] **Step 3: Write the implementation**

Create `src/qwk/wrap.ts`:

```ts
/**
 * Hard-wrap text to a fixed column width. Classic QWK/REP boards expect lines of
 * at most ~79 columns, so wrap before packing. Word-aware; a single token longer
 * than the usable width is hard-broken. An optional `prefix` (e.g. a quote
 * marker) is applied to every produced line and counts toward `width`, so quoted
 * lines and their continuations stay within the limit.
 */
export function wrapText(text: string, width = 79, prefix = ''): string {
  const avail = Math.max(1, width - prefix.length);
  const out: string[] = [];

  for (const line of text.split('\n')) {
    if (line.length === 0) {
      out.push(prefix.trimEnd()); // blank line (drop the prefix's trailing space)
      continue;
    }
    let cur = '';
    const flush = () => {
      out.push(prefix + cur);
      cur = '';
    };
    for (let word of line.split(' ')) {
      while (word.length > avail) {
        if (cur.length > 0) flush();
        out.push(prefix + word.slice(0, avail));
        word = word.slice(avail);
      }
      if (cur.length === 0) cur = word;
      else if (cur.length + 1 + word.length <= avail) cur += ' ' + word;
      else {
        flush();
        cur = word;
      }
    }
    flush();
  }
  return out.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/qwk/wrap.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/qwk/wrap.ts src/qwk/wrap.test.ts
git commit -m "feat(editor): 79-column word wrap with prefix support"
```

---

## Task 4: Quote builder

**Files:**
- Create: `src/qwk/quote.ts`
- Test: `src/qwk/quote.test.ts`

**Interfaces:**
- Consumes: `wrapText` from `./wrap` (Task 3).
- Produces: `initialsFor(author: string): string`; `buildQuote(parentBody: string, parentAuthor: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/qwk/quote.test.ts`:

```ts
import { initialsFor, buildQuote } from './quote';

describe('initialsFor', () => {
  it('uses first+last token initials for multi-word names', () => {
    expect(initialsFor('John Doe')).toBe('JD');
    expect(initialsFor('a b c')).toBe('AC');
  });

  it('uses the first two alphanumerics for a single handle', () => {
    expect(initialsFor('avon')).toBe('AV');
    expect(initialsFor('x')).toBe('X');
  });

  it('falls back to ? for empty/blank input', () => {
    expect(initialsFor('   ')).toBe('?');
  });
});

describe('buildQuote', () => {
  it('prepends an attribution line and prefixes each quoted line', () => {
    const out = buildQuote('line one\nline two', 'avon');
    const lines = out.split('\n');
    expect(lines[0]).toBe(' avon wrote:');
    expect(lines[1]).toBe('AV> line one');
    expect(lines[2]).toBe('AV> line two');
  });

  it('wraps long quoted lines to 79 including the prefix', () => {
    const out = buildQuote('w '.repeat(60).trim(), 'avon'); // ~119 chars
    for (const line of out.split('\n').slice(1)) {
      expect(line.length).toBeLessThanOrEqual(79);
      expect(line.startsWith('AV> ')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/qwk/quote.test.ts`
Expected: FAIL — cannot find module `./quote`.

- [ ] **Step 3: Write the implementation**

Create `src/qwk/quote.ts`:

```ts
import { wrapText } from './wrap';

/**
 * Quote-prefix initials for `author`. Multi-token names use the first letter of
 * the first and last token; a single handle uses its first two alphanumerics.
 * Uppercased, capped at 3, `?` when empty.
 *
 * PROVISIONAL: confirm the exact rule against vision-3-bbs.
 */
export function initialsFor(author: string): string {
  const tokens = author.trim().split(/\s+/).filter(Boolean);
  let ini: string;
  if (tokens.length >= 2) {
    ini = tokens[0][0] + tokens[tokens.length - 1][0];
  } else {
    ini = (tokens[0] ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2);
  }
  return (ini || '?').toUpperCase().slice(0, 3);
}

/** Attribution line prepended to a quoted block. PROVISIONAL — see vision-3-bbs. */
function attributionLine(author: string): string {
  return ` ${author} wrote:`;
}

/**
 * Build a quoted block from a parent message: one attribution line, then every
 * original line prefixed `II> ` and wrapped to 79 columns including the prefix.
 * Seeded into the editor body when the user chooses to quote, so they can trim it.
 *
 * PROVISIONAL: the attribution wording + initials rule are ViSiON/3 conventions
 * that live in vision-3-bbs (not in this repo). Confirm and adjust
 * `attributionLine` / `initialsFor` to match exactly.
 */
export function buildQuote(parentBody: string, parentAuthor: string): string {
  const prefix = `${initialsFor(parentAuthor)}> `;
  const quoted = wrapText(parentBody, 79, prefix);
  return `${attributionLine(parentAuthor)}\n${quoted}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/qwk/quote.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/qwk/quote.ts src/qwk/quote.test.ts
git commit -m "feat(editor): ViSiON-style quote builder (provisional wording)"
```

---

## Task 5: Finalize pipeline in repBuilder

**Files:**
- Modify: `src/store/repBuilder.ts`
- Test: `src/store/repBuilder.test.ts` (extend)

**Interfaces:**
- Consumes: `sanitizeBody` (Task 2), `wrapText` (Task 3), `appendTagline` (Task 1).
- Produces: `finalizeReplyBody(rawBody: string, tagline: string): string`; updated `draftToReply(d: Draft, tagline?: string): ReplyDraft`; updated `buildRepFromDrafts(bbsId: string, drafts: Draft[], tagline?: string): Uint8Array`.

- [ ] **Step 1: Write the failing test**

Add to `src/store/repBuilder.test.ts` (append inside the file, after the existing `describe`):

```ts
import { finalizeReplyBody } from './repBuilder';

const TAG = '--- ViSiON QWK Editor v0.1.0 (iOS)';

describe('finalizeReplyBody', () => {
  it('sanitizes, wraps to 79, and appends the tag line', () => {
    const out = finalizeReplyBody('He said “hi”', TAG);
    expect(out).toBe(`He said "hi"\n\n${TAG}`);
  });

  it('wraps long input to <=79 columns', () => {
    const out = finalizeReplyBody('word '.repeat(30).trim(), TAG);
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(79);
  });

  it('omits the tag line when none is supplied', () => {
    expect(finalizeReplyBody('hi', '')).toBe('hi');
  });
});

describe('buildRepFromDrafts with a tag line', () => {
  it('stamps the tag line into the packed body exactly once', () => {
    const d: Draft[] = [
      { id: 'd1', to: 'Avon', from: 'Zaphod', subject: 'Re: x', areaName: '', conferenceNumber: 3, priv: false, body: 'hello' },
    ];
    const once = buildRepFromDrafts('V3HQ', d, TAG);
    const twice = buildRepFromDrafts('V3HQ', d, TAG);
    expect(Array.from(once)).toEqual(Array.from(twice)); // idempotent
    const files = unzipSync(once);
    const msgs = parseMessagesDat(files['V3HQ.MSG']);
    expect(msgs[0].body).toContain(TAG);
    expect(msgs[0].body.split(TAG).length - 1).toBe(1); // stamped once
  });
});
```

> The existing tests call `buildRepFromDrafts('V3HQ', drafts)` (2 args) and assert
> exact bodies like `'thanks!'`. Making `tagline` optional (default `''`) keeps
> them green — do not modify them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/store/repBuilder.test.ts`
Expected: FAIL — `finalizeReplyBody` is not exported.

- [ ] **Step 3: Write the implementation**

Replace the contents of `src/store/repBuilder.ts` with:

```ts
/**
 * Bridge the outbox (UI drafts) to the engine's .REP writer. Bodies are put
 * through finalizeReplyBody (sanitize -> wrap 79 -> tag line) at build time, so
 * the editable draft stays raw while the on-wire form is canonical. Output bytes
 * are deterministic for a given set of drafts + tag line, so re-uploading is
 * idempotent (the server de-dupes) and the outbox can retry safely.
 */
import { writeRep, ReplyDraft } from '../qwk';
import { sanitizeBody } from '../qwk/sanitize';
import { wrapText } from '../qwk/wrap';
import { appendTagline } from '../qwk/tagline';
import { Draft } from './types';

/** Canonical on-wire body: sanitize -> 79-col wrap -> append tag line. */
export function finalizeReplyBody(rawBody: string, tagline: string): string {
  return appendTagline(wrapText(sanitizeBody(rawBody), 79), tagline);
}

export function draftToReply(d: Draft, tagline = ''): ReplyDraft {
  return {
    to: d.to,
    from: d.from,
    subject: d.subject,
    conference: d.conferenceNumber,
    body: finalizeReplyBody(d.body, tagline),
    isPrivate: d.priv,
    // Threading: in-packet parent number (offset 108) + durable In-Reply-To.
    reference: d.reference,
    inReplyTo: d.inReplyTo,
  };
}

/** Compile the current outbox drafts into a .REP packet for `bbsId`. */
export function buildRepFromDrafts(bbsId: string, drafts: Draft[], tagline = ''): Uint8Array {
  return writeRep(bbsId, drafts.map((d) => draftToReply(d, tagline)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/store/repBuilder.test.ts`
Expected: PASS (existing 3 + new 4).

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/store/repBuilder.ts src/store/repBuilder.test.ts
git commit -m "feat(editor): finalize reply bodies (sanitize/wrap/tagline) before packing"
```

---

## Task 6: Wire the live tag line through the store

**Files:**
- Create: `src/appMeta.ts`
- Create: `src/store/appTagline.ts`
- Modify: `src/store/net.ts:34-36`
- Modify: `src/store/useStore.ts` (the two `buildRepFromDrafts` / `pushDrafts` call sites)

**Interfaces:**
- Consumes: `formatTagline` (Task 1), `buildRepFromDrafts`/`draftToReply` (Task 5).
- Produces: `APP_VERSION: string`; `currentTagline(): string`; `pushDrafts(session, bbsId, drafts, tagline?)`.

This task touches `react-native` (`Platform`) and the store, which are not Node-unit-testable here. Verify with `npm run typecheck` and the manual step.

- [ ] **Step 1: Create the app-version constant**

Create `src/appMeta.ts`:

```ts
/**
 * App version surfaced in the reader tag line. Keep in sync with `app.json`'s
 * `expo.version` (currently 0.1.0). Kept as a plain constant to avoid a new
 * expo-constants dependency; bump on release.
 */
export const APP_VERSION = '0.1.0';
```

- [ ] **Step 2: Create the impure tag-line resolver**

Create `src/store/appTagline.ts`:

```ts
import { Platform } from 'react-native';
import { formatTagline } from '../qwk/tagline';
import { APP_VERSION } from '../appMeta';

/**
 * The tag line for the current device. Uses the real OS (Platform.OS), NOT the
 * settings.platform demo toggle. Isolated here so the pure qwk/ modules stay
 * free of react-native imports (and Node-testable).
 */
export function currentTagline(): string {
  const platform: 'iOS' | 'Android' = Platform.OS === 'android' ? 'Android' : 'iOS';
  return formatTagline(APP_VERSION, platform);
}
```

- [ ] **Step 3: Thread `tagline` through `pushDrafts`**

In `src/store/net.ts`, replace the `pushDrafts` function (lines 33-36):

```ts
/** Compile the outbox to a .REP and upload it; the server de-dupes retries. */
export function pushDrafts(
  session: QwkSession,
  bbsId: string,
  drafts: Draft[],
  tagline = ''
): Promise<UploadResult> {
  return session.upload(buildRepFromDrafts(bbsId, drafts, tagline));
}
```

- [ ] **Step 4: Pass the live tag line at the store's build sites**

In `src/store/useStore.ts`:

1. Add the import near the other store imports (after the `repBuilder` import):

```ts
import { currentTagline } from './appTagline';
```

2. In the demo-mode branch of `uploadRep`, replace the writer-exercise line:

```ts
        if (drafts.length) buildRepFromDrafts(board.bbsId, drafts, currentTagline()); // exercise the writer
```

3. In the real-upload branch of `uploadRep`, replace the `pushDrafts` call:

```ts
        const result = await pushDrafts(activeSession, board.bbsId, drafts, currentTagline());
```

- [ ] **Step 5: Verify types**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run: `npm test` (full suite)
Expected: PASS — existing `repBuilder`/`rep` tests unaffected (2-arg calls still default to no tag line).

- [ ] **Step 7: Commit**

```bash
git add src/appMeta.ts src/store/appTagline.ts src/store/net.ts src/store/useStore.ts
git commit -m "feat(editor): stamp live device tag line onto uploaded REP packets"
```

---

## Task 7: Draft edit + saved-reply selector

**Files:**
- Create: `src/store/draftSelectors.ts`
- Test: `src/store/draftSelectors.test.ts`
- Modify: `src/store/useStore.ts` (add `updateDraft` action + type; re-export selector)

**Interfaces:**
- Produces: `draftsForMessage(drafts: Draft[], reference: number, conferenceNumber: number): Draft[]`; store action `updateDraft(id: string, patch: Partial<Omit<Draft, 'id'>>): void`.

- [ ] **Step 1: Write the failing test**

Create `src/store/draftSelectors.test.ts`:

```ts
import { draftsForMessage } from './draftSelectors';
import { Draft } from './types';

const mk = (over: Partial<Draft>): Draft => ({
  id: 'd', to: 'a', from: 'b', subject: 's', areaName: '', conferenceNumber: 3, priv: false, body: '', ...over,
});

describe('draftsForMessage', () => {
  const drafts = [
    mk({ id: 'd1', reference: 100, conferenceNumber: 3 }),
    mk({ id: 'd2', reference: 100, conferenceNumber: 4 }), // wrong conference
    mk({ id: 'd3', reference: 200, conferenceNumber: 3 }), // wrong parent
    mk({ id: 'd4', reference: 100, conferenceNumber: 3 }),
  ];

  it('returns drafts replying to the given message in the given conference', () => {
    expect(draftsForMessage(drafts, 100, 3).map((d) => d.id)).toEqual(['d1', 'd4']);
  });

  it('returns [] when nothing matches', () => {
    expect(draftsForMessage(drafts, 999, 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/store/draftSelectors.test.ts`
Expected: FAIL — cannot find module `./draftSelectors`.

- [ ] **Step 3: Write the selector**

Create `src/store/draftSelectors.ts`:

```ts
import { Draft } from './types';

/**
 * Outbox drafts that are saved replies to a specific message: the draft's
 * in-packet parent number (`reference`) matches the message number and it targets
 * the same conference. Pure (no react-native/store deps) so it stays testable.
 */
export function draftsForMessage(
  drafts: Draft[],
  reference: number,
  conferenceNumber: number
): Draft[] {
  return drafts.filter((d) => d.reference === reference && d.conferenceNumber === conferenceNumber);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/store/draftSelectors.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the `updateDraft` action to the store**

In `src/store/useStore.ts`:

1. Add to the `AppState` interface, right after `addDraft` (line ~87):

```ts
  updateDraft: (id: string, patch: Partial<Omit<Draft, 'id'>>) => void;
```

2. Add the implementation right after the `addDraft` implementation (line ~362):

```ts
    updateDraft: (id, patch) => {
      set((s) => ({ drafts: s.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
      persist();
    },
```

3. Re-export the selector near the other selector re-exports at the bottom of the file (after the `messagesForArea` export block):

```ts
export { draftsForMessage } from './draftSelectors';
```

- [ ] **Step 6: Verify types**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store/draftSelectors.ts src/store/draftSelectors.test.ts src/store/useStore.ts
git commit -m "feat(editor): updateDraft action and saved-reply selector"
```

---

## Task 8: Navigation params + New Message / options routes

**Files:**
- Modify: `src/navigation/types.ts:16-30`
- Modify: `src/navigation/RootNavigator.tsx`

**Interfaces:**
- Produces: extended `Compose` params (`mode`, `editDraftId`, optional fields, `initialBody`); new routes `ComposeOptions`, `AreaPicker`.

This is a types + registration task; the screens it references are built in Tasks 9–11. To keep this task independently type-checkable, register the two new routes pointing at **minimal placeholder components created here** and fleshed out in later tasks. Verify with `npm run typecheck`.

- [ ] **Step 1: Extend the param list**

In `src/navigation/types.ts`, replace the `Compose: { ... }` entry and add the two new routes:

```ts
  Compose: {
    mode: 'reply' | 'new';
    /** When set, edit this existing outbox draft (fields loaded from the store). */
    editDraftId?: string;
    /** Reply/new target (ignored when editDraftId is set). */
    toHandle?: string;
    subject?: string;
    conferenceNumber?: number;
    areaName?: string;
    priv?: boolean;
    /** Parent message number, when composing a threaded reply. */
    reference?: number;
    /** Parent Message-ID, for durable In-Reply-To threading. */
    inReplyTo?: string;
    /** Seed text for the body (e.g. a quoted block). */
    initialBody?: string;
  };
  ComposeOptions: {
    /** Where this compose will post; forwarded to Compose on Start. */
    toHandle: string;
    subject: string;
    conferenceNumber: number;
    areaName: string;
    /** True when composing in the private-mail area (forces private, hides toggle). */
    privateArea: boolean;
    /** Reply threading + quote source (absent for New Message). */
    reference?: number;
    inReplyTo?: string;
    parentBody?: string;
    parentAuthor?: string;
    mode: 'reply' | 'new';
  };
  AreaPicker: undefined;
```

- [ ] **Step 2: Create placeholder screens**

Create `src/screens/ComposeOptionsScreen.tsx`:

```tsx
import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Mono } from '../components';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ComposeOptions'>;

export function ComposeOptionsScreen({ navigation }: Props) {
  return (
    <Screen title="OPTIONS" onBack={() => navigation.goBack()}>
      <Mono>Options placeholder</Mono>
    </Screen>
  );
}
```

Create `src/screens/AreaPickerScreen.tsx`:

```tsx
import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Mono } from '../components';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AreaPicker'>;

export function AreaPickerScreen({ navigation }: Props) {
  return (
    <Screen title="NEW MESSAGE" onBack={() => navigation.goBack()}>
      <Mono>Area picker placeholder</Mono>
    </Screen>
  );
}
```

- [ ] **Step 3: Register the routes**

In `src/navigation/RootNavigator.tsx`, import the two screens and add `Stack.Screen` entries alongside the existing `Compose` screen (mirror how `Compose` is registered — same import style and `<Stack.Screen name=... component=... />` placement).

```tsx
import { ComposeOptionsScreen } from '../screens/ComposeOptionsScreen';
import { AreaPickerScreen } from '../screens/AreaPickerScreen';
// ...
<Stack.Screen name="ComposeOptions" component={ComposeOptionsScreen} />
<Stack.Screen name="AreaPicker" component={AreaPickerScreen} />
```

- [ ] **Step 4: Verify types**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/navigation/types.ts src/navigation/RootNavigator.tsx src/screens/ComposeOptionsScreen.tsx src/screens/AreaPickerScreen.tsx
git commit -m "feat(editor): compose nav params, options + area-picker routes (scaffold)"
```

---

## Task 9: ComposeScreen — modes, save flow, sanitized confirmation

**Files:**
- Modify: `src/screens/ComposeScreen.tsx` (full rewrite)

**Interfaces:**
- Consumes: store `addDraft`, `updateDraft`, `activeBoard`, `useToast`; `Alert` from `react-native`.
- Produces: a Compose screen that handles `mode: 'reply' | 'new'` and `editDraftId`, with a Save/Kill/Edit prompt, an empty-body guard, and a `<BBSID>.REP` confirmation.

No component test harness exists; verify with `npm run typecheck` + the manual checklist.

- [ ] **Step 1: Rewrite the screen**

Replace the contents of `src/screens/ComposeScreen.tsx` with:

```tsx
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fonts, fontSize, letterSpacing, radius, spacing } from '../theme/tokens';
import { Screen, Mono, Card, Button, Chip, useToast } from '../components';
import { RootStackParamList } from '../navigation/types';
import { useStore, activeBoard } from '../store/useStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Compose'>;

export function ComposeScreen({ navigation, route }: Props) {
  const { mode, editDraftId } = route.params;
  const board = useStore(activeBoard);
  const drafts = useStore((s) => s.drafts);
  const addDraft = useStore((s) => s.addDraft);
  const updateDraft = useStore((s) => s.updateDraft);
  const removeDraft = useStore((s) => s.removeDraft);
  const toast = useToast();

  // When editing an existing draft, its stored fields win over route params.
  const editing = editDraftId ? drafts.find((d) => d.id === editDraftId) : undefined;

  const isNew = mode === 'new' && !editing;
  const [to, setTo] = useState(editing?.to ?? route.params.toHandle ?? (isNew ? 'All' : ''));
  const [subject, setSubject] = useState(editing?.subject ?? route.params.subject ?? '');
  const [body, setBody] = useState(editing?.body ?? route.params.initialBody ?? '');

  const priv = editing?.priv ?? !!route.params.priv;
  const areaName = editing?.areaName ?? route.params.areaName ?? '';
  const conferenceNumber = editing?.conferenceNumber ?? route.params.conferenceNumber ?? 0;
  const reference = editing?.reference ?? route.params.reference;
  const inReplyTo = editing?.inReplyTo ?? route.params.inReplyTo;

  const canSave = body.trim().length > 0;
  const repName = `${board?.bbsId ?? 'BBS'}.REP`;

  const commitSave = () => {
    const fields = {
      to: to.trim() || 'All',
      from: board?.handle ?? '',
      subject: subject.trim() || (mode === 'reply' ? 'Re:' : '(no subject)'),
      areaName,
      conferenceNumber,
      priv,
      body,
      reference,
      inReplyTo,
    };
    if (editing) updateDraft(editing.id, fields);
    else addDraft(fields);
    navigation.goBack();
    toast(`Saved to ${repName}`);
  };

  const kill = () => {
    if (editing) removeDraft(editing.id);
    navigation.goBack();
    toast('Message killed');
  };

  // Classic BBS save prompt: Save (default) / Kill (destructive) / Edit (cancel).
  const onSave = () => {
    if (!canSave) return;
    Alert.alert('Save message?', undefined, [
      { text: 'Edit', style: 'cancel' },
      { text: 'Kill', style: 'destructive', onPress: kill },
      { text: 'Save', onPress: commitSave },
    ]);
  };

  const title = isNew ? 'NEW MESSAGE' : editing ? 'EDIT REPLY' : 'REPLY';

  return (
    <Screen title={title} onBack={() => navigation.goBack()} scroll>
      <Card style={styles.header}>
        <View style={styles.metaRow}>
          <Mono size={fontSize.listMeta} color={colors.textMuted} spacing={letterSpacing.label}>To{'  '}</Mono>
          {isNew ? (
            <TextInput
              value={to}
              onChangeText={setTo}
              style={styles.toInput}
              placeholder="All"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
          ) : (
            <Mono size={fontSize.body} color={colors.blueText} weight="semibold">{to}</Mono>
          )}
          {priv && <View style={styles.chip}><Chip label="PRIVATE" color={colors.magenta} /></View>}
        </View>
        <View style={styles.metaRow}>
          <Mono size={fontSize.listMeta} color={colors.textMuted} spacing={letterSpacing.label}>Area{'  '}</Mono>
          <Mono size={fontSize.body} color={colors.textBody}>{areaName}</Mono>
        </View>
        <View style={styles.subjRow}>
          <Mono size={fontSize.listMeta} color={colors.magenta} spacing={letterSpacing.label}>Subj{'  '}</Mono>
          {isNew ? (
            <TextInput
              value={subject}
              onChangeText={setSubject}
              style={styles.subjInput}
              placeholder="Subject"
              placeholderTextColor={colors.textMuted}
            />
          ) : (
            <Mono size={fontSize.body} color={colors.textPrimary} style={styles.subjFixed} numberOfLines={1}>{subject}</Mono>
          )}
        </View>
      </Card>

      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        autoCorrect
        spellCheck
        textAlignVertical="top"
        placeholder="Write your message…"
        placeholderTextColor={colors.textMuted}
        style={styles.body}
      />

      <Button title="⬇ SAVE" onPress={onSave} disabled={!canSave} style={styles.save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, backgroundColor: colors.surfaceConsole },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  chip: { marginLeft: spacing.sm },
  toInput: { flex: 1, color: colors.blueText, fontFamily: fonts.mono, fontSize: fontSize.body, padding: 0 },
  subjRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.borderDivider, paddingTop: spacing.sm },
  subjInput: { flex: 1, color: colors.textPrimary, fontFamily: fonts.mono, fontSize: fontSize.body, padding: 0 },
  subjFixed: { flex: 1 },
  body: {
    marginTop: spacing.md,
    minHeight: 220,
    backgroundColor: colors.surfaceConsole,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderRadius: radius.input,
    padding: spacing.md,
    color: colors.textBody,
    fontFamily: fonts.vga,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  save: { marginTop: spacing.lg },
});
```

> The `Button` component must support a `disabled` prop. If it does not yet,
> add `disabled?: boolean` to its props in `src/components/primitives.tsx`,
> forward it to the underlying `Pressable`/`TouchableOpacity` (`disabled={disabled}`),
> and drop opacity to `0.4` when disabled — mirror the existing `variant`
> handling. Commit that primitive change with this task.

- [ ] **Step 2: Verify types**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run: `npm start` (Expo) and open the app in a simulator.
- Reader still opens Compose via REPLY (routing is replaced in Task 10 — for now, temporarily navigate to `Compose` with `{ mode: 'reply', ... }` if needed, or defer this check to Task 10).
- Confirm: Save button is disabled with an empty body; typing enables it.
- Tapping Save shows a **Save / Kill / Edit** prompt; Edit returns to editing; Save shows a toast `Saved to <BBSID>.REP` and returns; the draft appears in the Outbox.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ComposeScreen.tsx src/components/primitives.tsx
git commit -m "feat(editor): compose modes, Save/Kill/Edit prompt, empty guard, REP confirmation"
```

---

## Task 10: Pre-compose options modal + Reader reply routing + quoting

**Files:**
- Modify: `src/screens/ComposeOptionsScreen.tsx` (flesh out the placeholder)
- Modify: `src/screens/ReaderScreen.tsx` (`openReply` routes to `ComposeOptions`)

**Interfaces:**
- Consumes: `buildQuote` (Task 4); `PRIVATE_CONFERENCE` from the store/taxonomy; nav `Compose` params (Task 8).
- Produces: the working Private/Quote sheet that navigates on to `Compose`.

- [ ] **Step 1: Implement the options screen**

Replace `src/screens/ComposeOptionsScreen.tsx` with:

```tsx
import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fontSize, letterSpacing, spacing } from '../theme/tokens';
import { Screen, Mono, Card, Button } from '../components';
import { RootStackParamList } from '../navigation/types';
import { buildQuote } from '../qwk/quote';

type Props = NativeStackScreenProps<RootStackParamList, 'ComposeOptions'>;

export function ComposeOptionsScreen({ navigation, route }: Props) {
  const {
    toHandle, subject, conferenceNumber, areaName, privateArea,
    reference, inReplyTo, parentBody, parentAuthor, mode,
  } = route.params;

  const [priv, setPriv] = useState(privateArea); // forced on in the private area
  const [quote, setQuote] = useState(false);
  const canQuote = mode === 'reply' && !!parentBody;

  const start = () => {
    const initialBody = quote && parentBody ? buildQuote(parentBody, parentAuthor ?? toHandle) + '\n\n' : '';
    navigation.replace('Compose', {
      mode,
      toHandle,
      subject,
      conferenceNumber,
      areaName,
      priv: privateArea || priv,
      reference,
      inReplyTo,
      initialBody,
    });
  };

  return (
    <Screen title="OPTIONS" onBack={() => navigation.goBack()}>
      <Card style={styles.card}>
        {!privateArea && (
          <View style={styles.row}>
            <Mono size={fontSize.body} color={colors.textPrimary}>Private message?</Mono>
            <Switch value={priv} onValueChange={setPriv} />
          </View>
        )}
        {privateArea && (
          <Mono size={fontSize.listMeta} color={colors.magenta} spacing={letterSpacing.label}>
            PRIVATE MAIL — always private
          </Mono>
        )}
        {canQuote && (
          <View style={styles.row}>
            <Mono size={fontSize.body} color={colors.textPrimary}>Quote message?</Mono>
            <Switch value={quote} onValueChange={setQuote} />
          </View>
        )}
      </Card>
      <Button title="▸ START" onPress={start} style={styles.start} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, backgroundColor: colors.surfaceConsole },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  start: { marginTop: spacing.lg },
});
```

- [ ] **Step 2: Route Reader's reply through the options modal**

In `src/screens/ReaderScreen.tsx`, replace the `openReply` function so it navigates to `ComposeOptions` (carrying the parent body/author for quoting and the private-area flag). Add the import `import { PRIVATE_CONFERENCE } from '../store/useStore';` near the other store imports.

```tsx
  function openReply() {
    const conf = area?.qwkConference ?? 0;
    navigation.navigate('ComposeOptions', {
      mode: 'reply',
      toHandle: msg.from,
      subject: msg.subject.toLowerCase().startsWith('re:') ? msg.subject : `Re: ${msg.subject}`,
      conferenceNumber: conf,
      areaName: area?.name ?? '',
      privateArea: conf === PRIVATE_CONFERENCE || msg.isPrivate,
      reference: msg.number,
      inReplyTo: msg.messageId,
      parentBody: msg.body,
      parentAuthor: msg.from,
    });
  }
```

> `PRIVATE_CONFERENCE` is already re-exported from `useStore.ts` (via
> `store/taxonomy.ts`), so no new export is needed.

- [ ] **Step 3: Verify types**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run: `npm start`.
- Open a **public** message → REPLY → the options sheet shows both **Private?** and **Quote?** toggles. Toggle Quote on → START → the editor body is seeded with the ` <author> wrote:` attribution + `II> `-prefixed, 79-wrapped quote.
- Open a **private-mail** message → REPLY → the sheet shows "PRIVATE MAIL — always private", no Private toggle, but the **Quote?** toggle is present (shown for any reply with a parent body, private mail included); START → editor shows the `PRIVATE` chip.
- Save a quoted reply → Outbox → Upload (demo mode) → confirm it round-trips.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ComposeOptionsScreen.tsx src/screens/ReaderScreen.tsx
git commit -m "feat(editor): Private/Quote pre-compose sheet and Reader reply routing"
```

---

## Task 11: New Message entry + area picker

**Files:**
- Modify: `src/screens/AreaPickerScreen.tsx` (flesh out the placeholder)
- Modify: `src/screens/MessagesScreen.tsx` (add `＋ New` entry)

**Interfaces:**
- Consumes: store `areas`/`conferences`, `useStore`; nav `ComposeOptions`/`AreaPicker` (Task 8).
- Produces: a New Message flow — pick an area → options sheet → Compose in `new` mode.

- [ ] **Step 1: Implement the area picker**

Replace `src/screens/AreaPickerScreen.tsx` with:

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fontSize, spacing } from '../theme/tokens';
import { Screen, Mono, Card } from '../components';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';

type Props = NativeStackScreenProps<RootStackParamList, 'AreaPicker'>;

export function AreaPickerScreen({ navigation }: Props) {
  const areas = useStore((s) => s.areas);

  const choose = (a: (typeof areas)[number]) => {
    navigation.replace('ComposeOptions', {
      mode: 'new',
      toHandle: 'All',
      subject: '',
      conferenceNumber: a.qwkConference,
      areaName: a.name,
      privateArea: false,
    });
  };

  return (
    <Screen title="NEW MESSAGE" onBack={() => navigation.goBack()} scroll>
      <Mono size={fontSize.listMeta} color={colors.textMuted}>Choose an area to post in</Mono>
      <Card style={styles.list}>
        {areas.map((a, i) => (
          <View key={a.id} style={[styles.row, i < areas.length - 1 && styles.divider]}>
            <Mono size={fontSize.body} color={colors.textPrimary} onPress={() => choose(a)}>
              {a.name}
            </Mono>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden', marginTop: spacing.md },
  row: { padding: spacing.md },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.borderDivider },
});
```

- [ ] **Step 2: Add the `＋ New` entry to the message list**

In `src/screens/MessagesScreen.tsx`, add a header action that navigates to `AreaPicker`. Follow the existing `Screen` `right={...}` pattern used by other screens (e.g. the `GearButton` in `OutboxScreen`). Minimal version:

```tsx
// import at top:
import { Button } from '../components';
// ...
// in the Screen element, add:
<Screen
  title="MESSAGES"
  onBack={() => navigation.goBack()}
  right={<Button title="＋ NEW" variant="primary" onPress={() => navigation.navigate('AreaPicker')} style={{ height: 34, paddingHorizontal: 12 }} />}
  scroll
>
```

> Match the actual current props of `MessagesScreen`'s `Screen` element; only add
> the `right` prop. If `MessagesScreen` already provides a `right`, place the
> `＋ NEW` button beside the existing action in a small `View` row instead.

- [ ] **Step 3: Verify types**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run: `npm start`.
- Open any area's message list → tap **＋ NEW** → area picker lists the board's areas → choose one → options sheet (Private toggle only, no Quote) → START → editor in **new** mode with **editable To (default `All`)** and **editable Subject**.
- Save → the draft appears in the Outbox with the chosen area and To.

- [ ] **Step 5: Commit**

```bash
git add src/screens/AreaPickerScreen.tsx src/screens/MessagesScreen.tsx
git commit -m "feat(editor): New Message entry point and area picker"
```

---

## Task 12: Reader inline saved replies with tap-to-edit

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

**Interfaces:**
- Consumes: `draftsForMessage` (Task 7); nav `Compose` params (Task 8).
- Produces: inline `SAVED` reply rows in the Reader that reopen the editor for the tapped draft.

- [ ] **Step 1: Render saved replies below the message body**

In `src/screens/ReaderScreen.tsx`:

1. Add imports:

```tsx
import { useStore, messagesForArea, draftsForMessage } from '../store/useStore';
import { Chip } from '../components';
```

2. Inside the component, after `const area = areas.find(...)`, compute the saved replies:

```tsx
  const drafts = useStore((s) => s.drafts);
  const savedReplies = msg && area ? draftsForMessage(drafts, msg.number, area.qwkConference) : [];
```

3. After the message body `<Vga>...</Vga>` block and before the footer, render them:

```tsx
      {savedReplies.length > 0 && (
        <Card style={styles.saved}>
          {savedReplies.map((d, i) => (
            <View key={d.id} style={[styles.savedRow, i < savedReplies.length - 1 && styles.savedDivider]}>
              <View style={styles.savedHead}>
                <Mono size={fontSize.listMeta} color={colors.textPrimary} numberOfLines={1} style={styles.savedSubj}>
                  {d.subject}
                </Mono>
                <Chip label="SAVED" color={colors.green} />
              </View>
              <Mono
                size={fontSize.listMeta}
                color={colors.blueText}
                onPress={() => navigation.navigate('Compose', { mode: 'reply', editDraftId: d.id })}
                style={styles.savedEdit}
              >
                edit
              </Mono>
            </View>
          ))}
        </Card>
      )}
```

4. Add styles to the `StyleSheet.create({...})` block:

```tsx
  saved: { marginTop: spacing.lg, padding: 0, overflow: 'hidden' },
  savedRow: { padding: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.green, gap: 3 },
  savedDivider: { borderBottomWidth: 1, borderBottomColor: colors.borderDivider },
  savedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  savedSubj: { flex: 1, marginRight: spacing.sm },
  savedEdit: { marginTop: 2 },
```

- [ ] **Step 2: Verify types**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run: `npm start`.
- Reply to a public message and Save. Return to that same message in the Reader → a **SAVED** row appears below the body with the reply subject.
- Tap **edit** → the editor opens in EDIT mode preloaded with that draft's body → change text → Save → the Outbox draft is **updated** (not duplicated), and the Reader row reflects the change.
- Confirm a saved reply to a *different* message does **not** appear under this one.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(editor): inline saved replies with tap-to-edit in the Reader"
```

---

## Task 13: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new `tagline`, `sanitize`, `wrap`, `quote`, `repBuilder`, and `draftSelectors` tests.

- [ ] **Step 2: Typecheck the whole project**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: End-to-end manual round trip (demo mode)**

Run: `npm start`. With `settings.demoMode` on:
1. Reply (public) with Quote on → Save → Outbox shows the draft.
2. New Message into an area, To=`All`, Subject set → Save → Outbox shows it.
3. Upload REP → the import report renders; drafts clear.
4. Re-run the same drafts (recreate + upload) → confirm the flow is stable.
5. Verify a composed body: smart quotes typed on the keyboard arrive sanitized; long paragraphs are wrapped ≤79; the `--- ViSiON QWK Editor v0.1.0 (<platform>)` tearline is present exactly once. (Inspect by adding the draft, then in a scratch test call `finalizeReplyBody(draft.body, '--- ViSiON QWK Editor v0.1.0 (iOS)')` if visual inspection isn't enough.)

- [ ] **Step 4: Commit any final touch-ups**

```bash
git add -A
git commit -m "test(editor): full-suite verification pass" --allow-empty
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** private prompt (T10), quote prompt + pattern (T4/T10), native editor + empty guard (T9), Save/Kill/Edit (T9), `<BBSID>.REP` confirmation (T9), sanitization (T2/T5), tag line (T1/T6), 79-col wrap (T3/T5), New Message (T11), inline saved replies (T12), packet/subscription questions are answered in the spec §9 (no code). All covered.
- **Provisional item:** the quote attribution wording + initials rule (T4) are flagged — confirm against `vision-3-bbs` and adjust the two constants/functions before shipping.
- **No RN unit tests** are written because the harness is Node-only today; every RN task ends with typecheck + an explicit manual checklist instead of a fake test.
