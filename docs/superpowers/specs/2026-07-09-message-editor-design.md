# Message Editor — Design Spec

**Date:** 2026-07-09
**Status:** Approved for planning
**Scope:** The compose/reply text editor and the New Message entry point for the
ViSiON/3 QWK Mobile app. Packet management and subscription/newscan management are
*answered* here (§9) but *deferred* to their own specs.

---

## 1. Purpose & context

Phase 8 is an offline-first QWK/REP client. Everything a user reads or writes
happens against a locally cached packet; replies and new posts are staged in an
Outbox and assembled into a single idempotent `.REP` at upload time.

This spec covers the **editor**: how a user composes a new message or a reply,
how the text is prompted/quoted/edited/saved, and — critically — how the text is
**sanitized and wrapped** before it is packed into a `.REP`, so it will not
corrupt classic bulletin boards that expect strict ASCII/CP437 and ≤79-column
lines.

### What already exists (do not rebuild)

- [`ComposeScreen.tsx`](../../../src/screens/ComposeScreen.tsx) — a basic reply
  editor (fixed To/Area, editable Subject, multiline body) that saves a `Draft`.
- The Outbox pipeline: the `Draft` model
  ([`store/types.ts`](../../../src/store/types.ts)),
  [`addDraft`/`removeDraft`/`uploadRep`](../../../src/store/useStore.ts),
  [`repBuilder.ts`](../../../src/store/repBuilder.ts) →
  [`writeRep`](../../../src/qwk/rep.ts). Output bytes are **deterministic** for a
  given set of drafts, so re-uploading the same `.REP` is idempotent (the server
  de-dupes).
- Reader → reply threading: `reference` (in-packet parent number, QWK offset 108)
  and `inReplyTo` (durable Message-ID) are already carried end-to-end.
- `writeRep` already supports genuine UTF-8 via the `Utf8` HEADERS.DAT flag,
  falling back to CP437 otherwise.
- Packet management primitives: `deletePacket`, `clearPackets`,
  [`StorageScreen.tsx`](../../../src/screens/StorageScreen.tsx).

### What this spec adds

Private/quote pre-prompts; a New Message flow; a Save/Kill/Edit save prompt;
empty-body guard; a **pack-time text pipeline** (sanitize → wrap → tagline);
quote generation; and **inline saved-reply editing** in the Reader.

### Non-goals (explicitly out of scope)

Edit subject/To on a *reply*; ANSI/CP437 character picker; foreground color
selection; auto-signature editor; user-managed tag-line library; bulletin/news
file display; packet renaming; a storage-retention policy; area-subscription /
newscan-date management. These are noted where the user asked about them (§9) and
left for future specs.

---

## 2. Design decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| A | Doc scope | Focused **editor** spec; packet/subscription management answered but deferred. |
| B | "Saved to REP packet" model | **Outbox draft now, one `.REP` assembled at upload.** The confirmation names the packet the draft will join (`<BBSID>.REP`). |
| C | Inline saved-reply editing | **In scope.** Saved replies appear inline in the Reader with a `SAVED` marker, tap-to-edit. |
| D | Sanitizer aggressiveness | **Transliterate common autocorrect injections to ASCII; strip control/zero-width; keep the existing UTF-8 HEADERS.DAT fallback** for genuinely-intended non-ASCII. |
| E | Quote format | **Initials + `> ` per-line prefix** (`II> text`) with a one-line attribution. Exact attribution wording to be **confirmed against `vision-3-bbs`** (§6.1). |
| F | Tag line | **Tearline appended to body**: blank line + `--- ViSiON QWK Editor v<version> (<iOS\|Android>)`. |
| G | New Message fields | **To (default `All`) + Subject editable**; replies keep them fixed. |

---

## 3. Flows

### 3.1 Reply

```
Reader [REPLY]
  └─> Pre-compose options sheet
        • Private?  toggle (default N) — HIDDEN & forced-private in the private-mail area (conference 0)
        • Quote?    toggle (default N)
        [Start]
  └─> ComposeScreen (mode: 'reply')
        • To      : fixed (msg.from)
        • Subject : fixed ("Re: …" as today)
        • Body    : empty, OR seeded with the quoted block if Quote=Y
```

### 3.2 New Message

```
Messages/Areas screen [＋ New]
  └─> Area picker (defaults to the current area; lists existing areas for the board)
  └─> Pre-compose options sheet
        • Private?  toggle (default N) — hidden/forced in the private-mail area
        • Quote?    N/A (no parent) — not shown
        [Start]
  └─> ComposeScreen (mode: 'new')
        • To      : EDITABLE, default "All"
        • Subject : EDITABLE, empty
        • Body    : empty
```

### 3.3 Save (both modes)

```
[Save]  (disabled while trimmed body is empty)
  └─> Save-options prompt (default Save)
        • Save  → addDraft / updateDraft → toast "Saved to <BBSID>.REP" → goBack
        • Kill  → discard (no draft written; if editing, removeDraft) → goBack
        • Edit  → dismiss prompt, return to editing
```

The 3-way prompt is the classic BBS editor idiom (`(S)ave / (K)ill / (E)dit`).
Even though the user tapped "Save" to reach it, the prompt is the confirmation
step and the place Kill lives.

### 3.4 Inline saved-reply editing (Reader)

The Reader lists Outbox drafts that reply to the message currently shown (§6.2),
each with a `SAVED` chip. Tapping one reopens `ComposeScreen` with
`editDraftId` set, loading that draft's raw body for editing. Save updates the
existing draft; Kill removes it.

---

## 4. UI components & screens

### 4.1 Pre-compose options sheet (new)

A small modal/action sheet, not a full screen. Two labeled toggles (Private,
Quote) and a primary **Start** button. Rendered with existing primitives
(`Card`, `Button`, `Chip`) and theme tokens. Behavior:

- **Private toggle** — default off. In the private-mail area the toggle is not
  rendered and the message is forced private (`priv = true`).
- **Quote toggle** — default off. Only rendered in Reply mode (there is a parent
  message to quote). Never shown for New Message.

> Rationale: a single sheet with two toggles satisfies both "asks" from the
> requirements ("Private Message? default N", "Quote message?") while feeling like
> a modern mobile compose sheet rather than two sequential blocking dialogs.

### 4.2 ComposeScreen (extend existing)

Parameterized by `mode` and optional `editDraftId`. Differences from today:

- **To** — read-only `Mono` label in reply mode; a `TextInput` (default `All`) in
  new mode.
- **Subject** — read-only in reply mode (today it is editable; make it fixed to
  match decision G — editing a reply's subject is a future item); `TextInput` in
  new mode.
- **Body** — `TextInput multiline`, `autoCorrect`/`spellCheck` **enabled**,
  `textAlignVertical="top"`, VGA font. Native cursor/selection/copy. Seeded with a
  quoted block when Quote=Y, or with an existing draft's raw body when editing.
- **Save button** — `disabled` while `body.trim().length === 0`.
- On press → open the **save-options prompt** (§3.3), not an immediate save.
- On successful save → toast **"Saved to `<BBSID>.REP`"** (filename from the
  active board's `bbsId`).

### 4.3 New Message entry point

A `＋ New` affordance on the Messages list screen (area context) — a header
button consistent with the existing `Screen` `right` slot. Launching it uses the
current area by default; an area picker lets the user choose any of the board's
existing areas (`useStore` areas, excluding none — the private-mail area is a
valid target and forces private).

### 4.4 Reader inline saved replies (extend `ReaderScreen`)

Below the message body, render `draftsForMessage(...)` (§6.2). Each row: subject
preview + `SAVED` chip + tap target → `Compose` with `editDraftId`. Reuse
`MessageListRow`-style layout; keep the Reader otherwise read-only.

---

## 5. Pack-time text pipeline (correctness-critical)

The transform runs **at REP-build time**, in the `repBuilder` path, *before*
`writeRep`. Drafts store the user's **raw** body (freely editable, re-openable);
the canonical on-wire form is produced deterministically at build time. This
keeps the existing byte-stable idempotency: the same draft always produces the
same bytes, and the tag line is appended exactly once per build (never persisted
into the draft, so it can never double-stamp).

Three new **pure, independently unit-tested** modules under `src/qwk/`:

### 5.1 `sanitize.ts`

`sanitizeBody(text: string): string`

- Transliterate the common mobile-keyboard / autocorrect injections to ASCII:
  - Smart single quotes `‘ ’ ‚ ‛` → `'`
  - Smart double quotes `“ ” „ ‟` → `"`
  - Em dash `—` → `--`; en dash `–` → `-`; figure/minus dashes → `-`
  - Ellipsis `…` → `...`
  - Non-breaking space (U+00A0), narrow NBSP (U+202F) → regular space (U+0020)
  - Bullet `•` → `*` (best-effort; low priority)
- Normalize tabs: `\t` → a single space (U+0020) before wrapping, so column
  counting for the 79-col wrap is deterministic.
- Strip: C0/C1 control chars (except `\n`, handled below), zero-width characters
  (U+200B ZERO WIDTH SPACE, U+200C/U+200D ZWNJ/ZWJ, U+2060 WORD JOINER), and the
  BOM (U+FEFF).
- Normalize line endings to `\n` (defer the `\r`/`0xE3` encoding to `writeRep`).
- **Leave all other non-ASCII intact.** Characters the user genuinely intends
  (accented letters, CP437 box drawing, emoji) pass through untouched; `writeRep`
  then decides CP437 vs. the UTF-8 HEADERS.DAT path exactly as it does today.

> Ordering note: because sanitize runs before `writeRep`'s `isCp437` detection,
> transliterated typographic characters become plain ASCII and will **not** force
> an unnecessary UTF-8 flag. Only truly non-CP437 content trips the UTF-8 path.

### 5.2 `wrap.ts`

`wrapText(text: string, width = 79): string`

- Word-aware hard wrap, per already-existing hard line break. Each output line
  ≤ `width` columns.
- Tokens longer than `width` are hard-broken across lines.
- Preserve intentional blank lines (paragraph breaks).
- **Quote-prefix aware:** when wrapping a quoted line, the `II> ` prefix counts
  toward the width and is re-applied to each continuation line (see §6.1). The
  wrapper takes an optional per-line prefix so continuation lines stay correctly
  marked.

### 5.3 `tagline.ts`

`buildTagline(): string` → `--- ViSiON QWK Editor v<version> (<platform>)`

- `<version>` from the app build (`app.json` / `expo-constants`; currently
  `0.1.0`). Do **not** hard-code — read it so it tracks releases.
- `<platform>` = real device OS mapped to `iOS` / `Android` (`Platform.OS`).
  Note: `settings.platform` is a **demo preview toggle** and must **not** be used
  for the tag line — the tag line reflects the actual device.
- `appendTagline(body: string): string` appends a single blank line then the
  tagline as the final line.

### 5.4 Assembly

Add a `finalizeReplyBody(rawBody: string): string` step (in `repBuilder.ts` or a
small sibling) applied inside `draftToReply` / before `writeRep`:

```
finalizeReplyBody = appendTagline( wrapText( sanitizeBody( rawBody ) ) )
```

`writeRep`'s existing CP437/UTF-8 encoding is unchanged and consumes the
finalized body. Idempotency test: building the same drafts twice yields identical
zip bytes (extends the existing `rep`/`repBuilder` tests).

---

## 6. Quoting & inline replies

### 6.1 `quote.ts`

`buildQuote(parentBody: string, parentAuthor: string): string`

- One **attribution line**, then every original line prefixed with `II> `, where
  `II` = initials derived from `parentAuthor`.
- **Initials derivation (default):** uppercase; if the handle has ≥2
  whitespace-separated tokens, take the first character of the first and last
  token; otherwise take the first two alphanumeric characters. Cap at 3.
- Quoted lines are wrapped to 79 columns **including** the `II> ` prefix, reusing
  `wrapText`'s prefix support; continuation lines keep the prefix.
- The result is seeded into the editable body when Quote=Y, so the user can trim
  it Gmail-style before saving.

> ⚠️ **Confirm against `vision-3-bbs`.** The exact attribution wording and the
> precise initials rule are ViSiON/3 conventions that live in the `vision-3-bbs`
> repo, which is not present here. The implementer must open that repo and match
> its quoting output exactly; the rule above is a concrete, reasonable default to
> build and test against until confirmed. Encode the attribution string and
> initials rule as small, easily-adjusted constants/functions.

### 6.2 Inline saved replies

- Store selector `draftsForMessage(drafts, message, area)`: drafts whose
  `reference === message.number` and `conferenceNumber === area.qwkConference`
  (and matching the active board). These are the saved replies to that message.
- `ReaderScreen` renders them below the body with a `SAVED` chip; tap →
  `navigate('Compose', { mode: 'reply', editDraftId })`.

---

## 7. Store & navigation deltas

### 7.1 Store (`useStore.ts`, `types.ts`)

- **`updateDraft(id: string, patch: Partial<Omit<Draft, 'id'>>): void`** — edit an
  existing draft in place; `persist()`.
- **`draftsForMessage`** selector (§6.2).
- No change to the `Draft` shape is required for the core flow (`to`, `from`,
  `subject`, `areaName`, `conferenceNumber`, `priv`, `body`, `reference`,
  `inReplyTo` already exist). The raw, unfinalized body continues to live in
  `Draft.body`.

### 7.2 Navigation (`navigation/types.ts`)

Extend `Compose` params:

```ts
Compose: {
  mode: 'reply' | 'new';
  editDraftId?: string;        // inline edit of an existing draft
  // reply mode:
  toHandle?: string;
  subject?: string;
  reference?: number;
  inReplyTo?: string;
  // shared:
  conferenceNumber: number;
  areaName: string;
  priv?: boolean;
  // seed (quote): editor receives an initial body string
  initialBody?: string;
}
```

The pre-compose options sheet can be a separate lightweight route or a modal
presented before `Compose`; the implementation plan will choose based on the
navigation library already in use.

### 7.3 On-wire format

**Unchanged.** `writeRep`/HEADERS.DAT output is identical except that bodies are
now the finalized (sanitized/wrapped/tagged) text. No new packet fields.

---

## 8. Testing

Correctness-critical, so unit coverage is heavy and lives beside the modules:

- **`sanitize.test.ts`** — each transliteration; control/zero-width/BOM stripping;
  line-ending normalization; that intended non-ASCII survives (so the UTF-8 path
  still triggers when appropriate).
- **`wrap.test.ts`** — ≤79 enforced; word boundaries; over-long token breaking;
  blank-line preservation; prefix-aware wrapping widths.
- **`quote.test.ts`** — attribution line; per-line prefix; initials derivation
  (single-token vs multi-token handles); prefix + wrap interaction.
- **`tagline.test.ts`** — exact string; version/platform interpolation; single
  blank-line separator; appended exactly once.
- **`repBuilder` / `rep` idempotency** — building the same drafts twice yields
  byte-identical zips *with* the finalize pipeline in place; tag line never
  double-stamped across rebuilds.
- **Editor UX** — Save disabled on empty body; Save/Kill/Edit outcomes;
  private-area forces private and hides the toggle; New Message To/Subject
  editable and defaulting To=`All`.
- **Reader inline** — `draftsForMessage` matches only the current message's saved
  replies; tap opens the correct draft for edit.

Full offline round trip (compose → save → upload → server import) is validated
against a real ViSiON/3 instance with `qwkAPI.enabled=true`, including the
failure cases already required (interrupted downloads, duplicate uploads, stale
packet state).

---

## 9. Open questions from the requirements — answered

| Question | Answer |
|----------|--------|
| Do users see replies inline, marked "saved", and edit from there? | **Yes — in scope** (§3.4, §6.2). |
| Can users rename packets? | **No (recommended).** Packet filenames are protocol-derived (`<BBSID>.QWK/.REP`) and carry no user meaning; renaming would be cosmetic and risks confusing the BBSID-keyed pipeline. Not exposed. |
| How does packet management happen — view & nuke? | **Already exists** — `StorageScreen` + `deletePacket` / `clearPackets`. The editor adds nothing here. |
| What happens to old inbound QWK files — will they pile up? | They accumulate newest-first; the user can clear them in Storage. A retention cap (keep N most recent per board, or size ceiling) is **recommended but deferred** to a Storage-management spec. |
| Can users manage area subscriptions / newscan dates? | **No — server-owned.** Newscan pointers advance on the server during produce/consume (Phase 7 contract); the thin client cannot set them. Deferred/noted; would require a Phase 7 API surface that does not exist today. |
| How does one create a new message in any existing area? | **New Message flow** (§3.2): `＋ New` → area picker → editable To/Subject. |

---

## 10. Files touched (implementation map)

**New**
- `src/qwk/sanitize.ts` + `sanitize.test.ts`
- `src/qwk/wrap.ts` + `wrap.test.ts`
- `src/qwk/quote.ts` + `quote.test.ts`
- `src/qwk/tagline.ts` + `tagline.test.ts`
- Pre-compose options sheet component (+ New Message area picker) under
  `src/screens/` or `src/components/`.

**Modified**
- `src/store/repBuilder.ts` — add `finalizeReplyBody` and apply it in
  `draftToReply`.
- `src/store/useStore.ts` — `updateDraft`, `draftsForMessage`.
- `src/store/types.ts` — (only if a selector needs a helper type).
- `src/screens/ComposeScreen.tsx` — modes, editable To/Subject in new mode, save
  prompt, empty guard, seed body, `<BBSID>.REP` confirmation.
- `src/screens/ReaderScreen.tsx` — inline saved replies + tap-to-edit; route to
  the pre-compose sheet.
- `src/screens/MessagesScreen.tsx` (and/or `AreasScreen.tsx`) — `＋ New` entry.
- `src/navigation/types.ts` — extended `Compose` params + any options-sheet route.

**Unchanged**
- `src/qwk/rep.ts`, `headers.ts`, `cp437.ts`, `utf8.ts` — the REP writer and its
  encoding are consumed as-is; only the finalized body text differs.
