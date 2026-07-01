# QWK / REP Binary Format Specification

**Audience:** engineers implementing a QWK/REP parser and writer in TypeScript for
the ViSiON/3 QWK Mobile client.

**Scope:** the on-disk/on-wire byte formats only. This document is deliberately
precise about byte offsets, lengths, endianness, and text encoding so a parser and
writer can be built with unit tests. It cross-references the classic QWK spec
(Patrick Y. Lee, 1992), the "Mysterious QWK File Format" (Mike Wren), the
Synchronet reference (`wiki.synchro.net/ref:qwk`), the WWIV/QWKE extended spec, and
the MultiMail reader source. Where sources disagree, the conflict is called out
inline and collected in **§10 Known ambiguities**.

---

## 0. Global conventions (read first)

- **Container.** A QWK packet is a ZIP archive named `<BBSID>.QWK`. A reply packet
  is a ZIP archive named `<BBSID>.REP`. `<BBSID>` is the BBS identifier from
  `CONTROL.DAT` line 5 (see §1), typically 1–8 uppercase ASCII chars.
- **Text encoding.** All text is **IBM Code Page 437 (CP437)**, single-byte, unless
  a message is explicitly flagged UTF-8 via the Synchronet `HEADERS.DAT` `Utf8`
  field (see §5). Treat bytes as CP437 → Unicode on read; encode Unicode → CP437 on
  write (with a lossy fallback for un-mappable code points).
- **Line endings in text files** (`CONTROL.DAT`, `DOOR.ID`, `HEADERS.DAT`,
  `*.EXT`): **CRLF** (`0x0D 0x0A`). Be tolerant of bare LF on read; always emit
  CRLF on write.
- **Line endings inside message bodies** (`MESSAGES.DAT` / `<BBSID>.MSG`): a single
  byte **`0xE3` (227, the CP437 `π` "pi" glyph)** stands in for a hard line break.
  This is NOT CRLF. See §2.3 — this is one of the most error-prone points.
- **Offset base.** This document uses **0-based** byte offsets within each 128-byte
  block. The classic Patrick Lee spec numbers fields **1-based** (its "position 1"
  is our offset 0). Both numbering schemes appear in the wild; the field *layout*
  is identical. Watch for this when comparing against other documents.
- **Record length.** `MESSAGES.DAT` and `<BBSID>.MSG` have a fixed logical record
  length of **128 bytes**. Every message occupies an integer number of 128-byte
  blocks: 1 header block + N text blocks.
- **Multi-byte integers** in the header block are **little-endian** (LSB first),
  unsigned 16-bit.
- **ASCII numeric fields** are decimal digits, **left-justified, space-padded** on
  the right (space = `0x20`).

---

## 1. CONTROL.DAT

Plain CP437 text, **CRLF-terminated lines**. Describes the originating BBS and the
conference directory. Fixed leading lines, then a variable conference list, then
three screen-file names. Some doors append extra trailing lines; **ignore anything
after the three screen-file lines.**

| Line (1-based) | Content | Example | Notes |
|---|---|---|---|
| 1 | BBS name | `My BBS` | free text |
| 2 | BBS city and state | `New York, NY` | free text |
| 3 | BBS phone number | `212-555-1212` | free text |
| 4 | Sysop name | `John Doe` | free text |
| 5 | `serial,BBSID` | `12345,MYBBS` | mail-door serial/registration number, comma, then the **BBSID** used to name the packet. BBSID is what you echo back in the `.REP` filename and `<BBSID>.MSG`. |
| 6 | Packet creation date/time | `07-01-2026,23:59:59` | **mixed-case / 4-digit-year** form `MM-DD-YYYY,HH:MM:SS`. Note this differs from the message header date which is `MM-DD-YY` (see §2.2). |
| 7 | Recipient user name | `JANE DOE` | the user the packet was built for, conventionally **UPPERCASE**. |
| 8 | Qmail menu file name | *(blank)* | usually an empty line. |
| 9 | Zero / net-mail conf | `0` | almost always `0`. (Some docs describe this as a FidoNet/netmail conference number; treat non-zero as informational.) |
| 10 | Total number of messages in packet | `999` | informational; do not rely on it for parsing — parse `MESSAGES.DAT` by block count. |
| 11 | **Highest conference index = (conference count − 1)** | `4` | See semantics below. |
| 12 … | Conference **number/name pairs**, two lines each | `0` / `Main Board` | repeated `(line 11 value + 1)` times. First line of each pair = conference number (ASCII decimal); second = conference name (≤ 13 chars conventionally, but do not assume — read the whole line). |
| after pairs | Welcome screen file name | `BLT-1.0` | file base name (no path). May be blank. |
| next | News/bulletin file name | `NEWS` | may be blank. |
| next | Goodbye/logoff screen file name | `GOODBYE` | may be blank. |
| after | *anything else* | | **ignore.** Not standardized; varies by door (MarkMail etc. append user stats, expiration, tag-line, mixed-case name). |

### 1.1 Conference-count semantics (count − 1) — IMPORTANT

Line 11 is **the number of conferences minus one** (i.e., the highest 0-based
conference index). To read the directory:

```
n = parseInt(line11)          // e.g. 4
conferenceCount = n + 1       // 5 conferences
read conferenceCount pairs    // 10 lines: number, name, number, name, ...
```

Conference numbers in the pairs are **arbitrary integers**, not guaranteed to be
`0..n` contiguous, though they usually start at 0 (the "Main Board"). Build a
`Map<confNumber, confName>` from the pairs rather than assuming index order.

> **Ambiguity:** the exact purpose of lines 8–9 varies across doors (menu file /
> netmail conf / `0`). They are safe to skip. Only lines 1–7, line 11, and the
> pairs matter for our client. Test against a real ViSiON/3 packet.

---

## 2. MESSAGES.DAT

Sequence of 128-byte blocks:

```
[ block 0: "producer" header block ]
[ message 1 header block ][ message 1 text block(s) ]
[ message 2 header block ][ message 2 text block(s) ]
...
```

### 2.1 Producer block (block 0, first 128 bytes)

The very first 128 bytes are **not a message**. They contain an ASCII
identification string for the software that produced the packet, conventionally
beginning with `Produced by ...`, padded with spaces to 128 bytes. **Skip these
128 bytes before reading the first message header.** (In a `.REP` the analogous
first block instead carries the BBSID — see §6.)

### 2.2 Message header block (128 bytes) — canonical offset table

Offsets are **0-based**. (Add 1 for the classic Patrick Lee "position" numbering.)

| Offset | Len | Field | Type / format | Notes |
|---:|---:|---|---|---|
| 0 | 1 | Status flag | 1 ASCII char | See §2.4. `' '`=public unread, `'-'`=public read, `'*'`=private unread, `'+'`=private read, etc. |
| 1 | 7 | Message number | ASCII decimal, left-justified, space-padded | 1..9,999,999. In a `.REP` producer context this field may instead hold a conference number (see §6). |
| 8 | 8 | Date | ASCII `MM-DD-YY` | **2-digit year** (unlike CONTROL.DAT). |
| 16 | 5 | Time | ASCII `HH:MM` | 24-hour. (Offsets 8–20 together are the 13-byte date+time Synchronet lists as one field.) |
| 21 | 25 | To | CP437, left-justified, space-padded | Conventionally UPPERCASE. Truncated to 25; longer values go in `HEADERS.DAT` / body kludge (§5, §7). |
| 46 | 25 | From | CP437, space-padded | as above |
| 71 | 25 | Subject | CP437, space-padded | mixed case allowed; truncated to 25. |
| 96 | 12 | Password | ASCII, space-padded | usually blank; message-level password. |
| 108 | 8 | Reference number | ASCII decimal, space-padded | The **In-Reply-To message number** — the parent message this one replies to (`0`/blank if none). This is the primary in-packet threading link (see §5.4). |
| 116 | 6 | Number of blocks | ASCII decimal, space-padded | **Total 128-byte blocks for this message INCLUDING the header block.** Minimum value is `2` (1 header + ≥1 text block). Text-block count = value − 1. **Common bug source — test this.** |
| 122 | 1 | Active flag | 1 byte | **`0xE1` (225) = active**, **`0xE2` (226) = deleted/killed**. (Decimal 225/226.) |
| 123 | 2 | Conference number | uint16 **little-endian** | The conference this message belongs to. LSB at 123, MSB at 124. |
| 125 | 2 | Logical/relative message number | uint16 **little-endian** | Per-conference sequence number. |
| 127 | 1 | Net tag-line indicator | 1 byte | `'*'` (0x2A) if a network tag-line is present, else space. |

Field-length sum check: `1+7+8+5+25+25+25+12+8+6+1+2+2+1 = 128`. ✓

> **Byte-order note.** The conference number at 123 is a little-endian 16-bit word.
> Older docs describe byte 124 (0-based, = position 125 1-based) as "sometimes a
> filler space." When high byte is `0x20` (space) it can be either padding or a
> real MSB; use `CONTROL.DAT`'s highest conference number to disambiguate if you
> ever see ambiguous values. In practice, read it as `LSB | (MSB << 8)` and it
> works for all conferences ≤ the max reported in CONTROL.DAT.

### 2.3 Message body (text blocks) — 0xE3 end-of-line encoding — IMPORTANT

Immediately after each header block come `(numberOfBlocks − 1)` text blocks of 128
bytes each. Concatenate them, then decode:

- **Hard line breaks are encoded as the single byte `0xE3` (227).** There are no
  CRLFs inside the body. (In CP437, `0xE3` renders as `π`; the format simply
  reuses that byte value as a line separator.)
- The final text block is **padded on the right with spaces (`0x20`)** to fill 128
  bytes. (Some producers pad with NUL `0x00`; trim trailing padding tolerantly.)

**Read direction (parse):**
1. Read `(numberOfBlocks − 1) * 128` bytes.
2. Replace every `0xE3` byte with your internal newline (`\n`, or `\r\n`).
3. Strip trailing pad bytes (spaces/NULs) from the last line.
4. Decode the result from CP437 to Unicode.

**Write direction (produce a REP):**
1. Encode the body text from Unicode to CP437.
2. Replace every line break (`\r\n`, `\r`, or `\n`) with a single `0xE3` byte.
3. Append the body after the header block; **pad the last block to a 128-byte
   boundary with spaces.**
4. Set the header `Number of blocks` = `1 + ceil(bodyLen / 128)`.

> **Variant flag:** some "Greek"/localized QWK variants use byte `12` (0x0C, form
> feed) instead of `0xE3` as the line break (MultiMail exposes this as a
> `greekqwk` toggle). ViSiON/3 uses the standard `0xE3`; do not implement the
> variant unless a real packet demonstrates it.
>
> **QWKE kludge terminator:** the `To:`/`From:`/`Subject:` kludge lines that QWKE
> prepends to the body (see §7) may be terminated by **either `0xE3` or a bare
> CR `0x0D`**. Your line splitter should treat both as line boundaries when
> scanning for leading kludge lines.

### 2.4 Status flag values (offset 0)

| Char | Meaning |
|---|---|
| `' '` (space) | public, unread |
| `-` | public, read |
| `*` | private, unread |
| `+` | private, read |
| `~` | sysop comment, unread |
| `` ` `` | sysop comment, read |
| `%` | sender-password protected, unread |
| `^` | sender-password protected, read |
| `!` | group-password protected, unread |
| `#` | group-password protected, read |
| `$` | (group password, additional variant) |

The active/deleted state is governed independently by the byte at offset 122
(225/226), not by this flag.

---

## 3. Index files: `NNN.NDX` and `PERSONAL.NDX`

One index file **per conference**, named by the **conference number zero-padded to
3 digits** + `.NDX` (e.g. conference 0 → `000.NDX`, conference 12 → `012.NDX`).
Four-digit conferences use a 4-digit name (`xxxx.NDX`). `PERSONAL.NDX` indexes all
messages addressed to the packet's recipient (across conferences).

Index files are **optional** — a robust reader should be able to reconstruct the
same information by scanning `MESSAGES.DAT` sequentially (Synchronet does not even
generate `.NDX`). Prefer scanning `MESSAGES.DAT` as the source of truth; use
`.NDX`/`PERSONAL.NDX` only as an optimization or for the "personal" filter.

### 3.1 Record format — 5 bytes

| Offset | Len | Field | Type |
|---:|---:|---|---|
| 0 | 4 | Message pointer | 4-byte **MSBIN** (Microsoft Binary Format) single-precision float |
| 4 | 1 | Conference number | uint8 |

The conference byte is only 8 bits, so `.NDX` cannot represent conferences > 255 —
another reason to treat `MESSAGES.DAT` as authoritative.

### 3.2 What the pointer indexes

The MSBIN float, converted to an integer, is the **1-based 128-byte block number**
of the message's **header block** within `MESSAGES.DAT`.

```
blockNumber = MSBINtolong(bytes[0..3])       // 1-based
byteOffset  = (blockNumber - 1) * 128         // seek position of the header block
```

Block 1 is the producer block (§2.1); the first real message header is block 2,
i.e. byte offset 128. So the first message's `.NDX` pointer value is `2`.

### 3.3 MSBIN → integer conversion — IMPLEMENT EXACTLY

4-byte MSBIN single, stored **in file order** as `b0 b1 b2 b3`:

- `b0` = mantissa low byte
- `b1` = mantissa middle byte
- `b2` = mantissa high byte (bit 7 is the MBF sign bit; for NDX pointers it is 0)
- `b3` = biased exponent (bias **128 / 0x80**); `b3 == 0` means the value is 0.0

Because the stored values are small positive integers, the proven MultiMail routine
reconstructs the integer directly (no floating point needed):

```
// pseudocode; all arithmetic on unsigned 32-bit integers
function MSBINtolong(b0, b1, b2, b3):
    if b3 == 0: return 0
    mantissa = b0 | (b1 << 8) | (b2 << 16)   // 24-bit mantissa field
    mantissa = mantissa | 0x800000            // restore the implied leading 1 bit
    shift    = 24 + 0x80 - b3                  // = 152 - exponent
    return mantissa >> shift
```

**Worked examples (verify in unit tests):**

| Integer value | MBF bytes `b0 b1 b2 b3` | Computation | Result |
|---|---|---|---|
| 1 | `00 00 00 81` | `0x800000 >> (152−129=23)` = `2^23 >> 23` | `1` |
| 2 | `00 00 00 82` | `0x800000 >> (152−130=22)` = `2^23 >> 22` | `2` |
| 3 | `00 00 40 82` | `0xC00000 >> 22` | `3` |
| 4 | `00 00 00 83` | `0x800000 >> (152−131=21)` | `4` |

> **Caveats / test carefully:**
> - The routine ignores the MBF sign bit (fine for NDX, whose values are positive)
>   and treats `0x800000` as the implied mantissa bit. This is the standard,
>   working interpretation used by real readers; don't "fix" it.
> - Historically many doors wrote broken `.NDX` files (this is why the MSBIN choice
>   is widely criticized). Always be prepared to fall back to a sequential
>   `MESSAGES.DAT` scan if pointers look wrong (e.g. non-integer results, out of
>   range).
> - MSBIN is **little-endian in the mantissa**; do not byte-swap the input.

---

## 4. DOOR.ID (informational)

CP437 text, CRLF lines, `KEY = VALUE` pairs. Identifies the mail door/software and
advertises capabilities the reader may use when building a `.REP`. Typical content:

```
DOOR = <door name>
VERSION = <version>
SYSTEM = <BBS software / name>
CONTROLNAME = <basename the reader uses for control/reply files, e.g. TOMCAT>
CONTROLTYPE = ADD            ; door supports conference "add" requests
CONTROLTYPE = DROP           ; door supports conference "drop" requests
CONTROLTYPE = REQUEST
RECEIPT                      ; (optional) supports return receipts
```

QWKE extends `DOOR.ID` with additional `CONTROLTYPE` capability lines (see §7):
`MAXKEYWORDS`, `MAXFILTERS`, `MAXTWITS`, `ALLOWATTACH`, `ALLOWFILES`,
`ALLOWREQUESTS`, `MAXREQUESTS`. A `MIXED CASE`/mixed-case capability may also be
advertised here (tells the reader the door preserves case rather than uppercasing
To/From). For our client, `DOOR.ID` is **informational only** — parse it leniently,
key off `CONTROLNAME`/`CONTROLTYPE` if we ever implement conference add/drop, and
otherwise ignore it.

---

## 5. HEADERS.DAT (Synchronet QWKE / extended headers) — MOST ERROR-PRONE

`HEADERS.DAT` is a Synchronet extension that carries full, un-truncated header
metadata (long To/From/Subject, RFC-style Message-ID/threading, UTF-8 flag, FidoNet
kludges, etc.) that cannot fit in the fixed 128-byte `MESSAGES.DAT` header. It is a
**CP437/UTF-8 text file** (CRLF) organized into INI-style sections.

### 5.1 How a message's record is located — the key mechanism

**The record is NOT located via a pointer stored in the `MESSAGES.DAT` header
block.** (The rumor that the byte-offset is stored "in the message-number field as
a decimal string" is **false** — the message-number field at offset 1 holds the
actual message number.)

Instead, each section in `HEADERS.DAT` is **named by the byte-offset, in
lowercase hexadecimal, of that message's 128-byte header block within
`MESSAGES.DAT`**, written as an INI section header in square brackets. Verbatim from
the Synchronet reference:

> "Each section in the `HEADERS.DAT` file correlates with a message in the
> corresponding `MESSAGES.DAT` (or `<ID>.MSG`) file. The section name is the
> byte-offset (in hexadecimal) into the `MESSAGES.DAT` file of the corresponding
> message's header block."

Example section header for the message whose header block starts at byte 3200
(`0xC80`):

```
[c80]
```

**Therefore the linkage is computed, not stored:** as you walk `MESSAGES.DAT`
sequentially, track the absolute byte offset at which each message's header block
begins. To fetch that message's extended headers, format that offset as hex (no
`0x`, matching Synchronet's casing — lowercase in practice) and look up the
`[<hexOffset>]` section in `HEADERS.DAT`. The first real message's header block is
at offset 128 → section `[80]`.

> Practical note: match section names by **numeric value**, not by string, so you
> are robust to leading zeros or upper/lower-case hex differences between producers.

### 5.2 Record (section) syntax

Within a `[<hexOffset>]` section, one `Header-Name` per line:

```
[80]
Utf8: true
Message-ID: <20260701.1@example.synchro.net>
In-Reply-To: <20260630.9@example.synchro.net>
Subject: A subject line that is much longer than twenty-five characters
To: A Very Long Recipient Display Name
From: Sender Name <sender@example.org>
```

Rules (verbatim from the Synchronet reference):

- Pairs may use `key = value` **or** `key: value`; **`key:` is preferred** because
  it signals that trailing whitespace is significant and must be retained.
- Each value may be up to **1024 US-ASCII characters**.
- A section ends at the next `[...]` section header or EOF. (Blank lines separate
  sections in practice; treat a blank line or the next `[` as the terminator.)
- **Encoding:** high-bit bytes are **CP437** *unless* the message is flagged UTF-8.
  If the `Utf8` field is present/true, then **all** header fields for that message
  that contain high-ASCII must be interpreted as UTF-8.

### 5.3 Standard field names

From the Synchronet reference (not exhaustive — additional RFC822-style fields may
appear; ignore unknown ones gracefully):

```
Utf8              Format            Message-ID        In-Reply-To
WhenWritten       WhenImported      WhenExported      ExportedFrom
Sender            SenderNetAddr     SenderIpAddr      SenderHostName
SenderProtocol    Organization      Reply-To          Subject
To                ToNetAddr         Editor            Columns
Tags              Path              Newsgroups        Conference
X-FTN-AREA        X-FTN-SEEN-BY     X-FTN-PATH        X-FTN-MSGID
X-FTN-REPLY       X-FTN-PID         X-FTN-Flags       X-FTN-TID
X-FTN-CHRS        X-FTN-Kludge
```

Fields most relevant to our client:
- **`Subject`, `To`, `From`** — the *full-length* values (see §5.5).
- **`Message-ID`** — globally-unique RFC-style id for robust threading.
- **`In-Reply-To`** — the parent's `Message-ID` (RFC-style threading; see §5.4).
- **`Reply-To`** — reply address override.
- **`Utf8`** — presence/`true` means UTF-8 for this message's header fields (and,
  by convention, the body).
- **`Tags`** — Synchronet message tags.
- **`ToNetAddr` / `SenderNetAddr`** — network addresses when To/From are addresses.

> Note: the Synchronet field list above shows `To` and `From` values, plus address
> variants (`ToNetAddr`, `SenderNetAddr`). Some producers also emit `From` and
> `References`; accept `References` as a space-separated list of ancestor
> Message-IDs if present, even though it is not in Synchronet's canonical list.

### 5.4 Threading: reference field vs. In-Reply-To

Two independent linkage mechanisms exist; support both:

1. **In-packet numeric link — `MESSAGES.DAT` reference field (offset 108, 8 ASCII
   digits).** Holds the **message number** (the value from another message's
   offset-1 field) of the parent. This is the classic QWK reply linkage and works
   entirely within one packet's numbering. Range up to 99,999,999 (8 digits),
   which is why it can exceed the 7-digit message-number field.

2. **Global RFC-style link — `HEADERS.DAT` `In-Reply-To` (and `References`).**
   Holds the parent's `Message-ID` string (globally unique). Preferred for durable
   cross-packet/cross-network threading, and required when the numeric reference is
   unavailable or ambiguous.

Recommended reader behavior: build threads primarily from `Message-ID` /
`In-Reply-To` when `HEADERS.DAT` is present; fall back to the numeric reference
field (108) otherwise.

### 5.5 Long To/From/Subject (> 25 chars)

The 25-byte `MESSAGES.DAT` fields hold a **truncated** copy. The **authoritative
full-length** value is in the corresponding `HEADERS.DAT` section's `To` / `From` /
`Subject` field (up to 1024 chars). When `HEADERS.DAT` has a value, prefer it over
the truncated 25-byte header field. (QWKE also provides a body-kludge fallback for
non-Synchronet packets — see §7.)

---

## 6. .REP reply packet

A `.REP` is a ZIP named `<BBSID>.REP` containing at minimum **`<BBSID>.MSG`** — the
messages the user wrote offline, to be posted by the door. It uses the **same
128-byte block format as `MESSAGES.DAT`** (§2). QWKE/Synchronet reply packets may
additionally include **`HEADERS.DAT`** and control files (`TODOOR.EXT`,
`VOTING.DAT`, attachments) — see §7.

### 6.1 `<BBSID>.MSG` structure

```
[ block 0: BBSID header block ]
[ reply 1 header block ][ reply 1 text block(s) ]
[ reply 2 header block ][ reply 2 text block(s) ]
...
```

- **Block 0 (the "producer" slot) carries the BBSID.** Unlike `MESSAGES.DAT` block
  0 (which holds "Produced by..." software text), the `.REP` first block holds the
  **QWK-ID / BBSID of the target BBS** (the system the reply will be uploaded to),
  ASCII, left-justified at offset 0, space-padded to 128 bytes. Write the BBSID
  from `CONTROL.DAT` line 5 here.
- Each subsequent message uses the standard header block (§2.2) + `0xE3`-encoded
  body (§2.3).

### 6.2 Reply header fields that matter

| Field (offset) | On write (building a reply) |
|---|---|
| Status flag (0) | `' '` (public) or `'*'` (private) as appropriate. |
| Message number (1) | May be `0`/blank — the BBS assigns the real number on import. |
| Date (8) `MM-DD-YY`, Time (16) `HH:MM` | local composition time. |
| To (21,25) / From (46,25) / Subject (71,25) | truncated 25-byte copies; full values go to `HEADERS.DAT` if used. |
| Reference number (108, 8) | **parent message number** if this reply is threaded (see §5.4). |
| Number of blocks (116, 6) | `1 + ceil(bodyBytes/128)`. |
| Active flag (122) | `0xE1` (225). |
| **Conference number (123, uint16 LE)** | **the destination conference** to post into — the number from `CONTROL.DAT`. This is how the door routes each reply. Set it correctly per message. |
| Logical msg number (125) | `0`/unused on write. |
| Net tag-line (127) | space unless emitting a tag-line. |

### 6.3 HEADERS.DAT in a REP (QWKE clients)

If we want durable threading / long fields / UTF-8 on **outbound** replies to a
Synchronet host, include a `HEADERS.DAT` in the `.REP` using the **same mechanism
as §5**: for each reply, name its section `[<hexOffsetOfItsHeaderBlockInMSG>]` and
emit `Subject`, `To`, `From`, `Message-ID` (generate one), `In-Reply-To` (parent's
Message-ID), and `Utf8: true` if the body/headers contain non-CP437 characters.
Non-QWKE hosts simply ignore `HEADERS.DAT`.

### 6.4 Idempotent/retry-safe uploads (project requirement)

Synchronet de-duplicates REP uploads, so re-uploading an identical `<BBSID>.REP`
is safe. To make de-dup reliable, keep the byte content of a queued `.REP` stable
across retries (stable `Message-ID`s, stable ordering, stable timestamps) so the
server sees the same packet. Only advance the outbox state after a fully
acknowledged upload.

---

## 7. QWKE / QWK-Extended flags (summary)

QWKE (the WWIV-hosted spec) is the non-Synchronet extension for long fields,
conference add/drop, attachments, keyword filters, and twit lists. Relevant bits:

- **Body kludge lines (long To/From/Subject fallback).** When To/From/Subject
  exceed 25 chars, QWKE prepends kludge lines to the **message body**:
  ```
  To: <full recipient>
  From: <full sender>
  Subject: <full subject>
  ```
  Only fields that exceed 25 chars are emitted. Each kludge line is terminated by
  **either `0xE3` or a bare CR (`0x0D`)**. On read, strip recognized leading
  kludge lines from the body and use them to override the truncated 25-byte header
  fields. (Synchronet packets use `HEADERS.DAT` §5 for the same purpose; a message
  may use one mechanism or the other.)
- **`DOOR.ID` capability lines** (see §4): `CONTROLNAME=<base>`, and
  `CONTROLTYPE=` one of `ADD`, `DROP`, `MAXKEYWORDS`, `MAXFILTERS`, `MAXTWITS`,
  `ALLOWATTACH`, `ALLOWFILES`, `ALLOWREQUESTS`, `MAXREQUESTS`. Presence tells the
  reader which control operations the door accepts.
- **`MIXED CASE`.** Advertised support means the door preserves case in To/From
  rather than uppercasing; our reader should not force-uppercase display names when
  this is present.
- **Control/extension files.** `TOREADER.EXT` (door → reader: `ALIAS`, `AREA`
  with flags, `BULL`, `ATTACH`, `FILE`, `KEYWORD`, `FILTER`, `TWIT`) and
  `TODOOR.EXT` (reader → door: `AREA`, `RESET`, `ATTACH`, `FILE`, `REQUEST`,
  `KEYWORD`, `FILTER`, `TWIT`; `-`-prefix = delete). These are **out of scope** for
  the offline mail read/reply round trip but documented here so the parser can skip
  them safely.

For our thin client, the minimum viable QWKE support is: (a) read Synchronet
`HEADERS.DAT` for long fields + threading + UTF-8, (b) strip/honor body kludge
lines as a fallback, (c) parse `DOOR.ID` leniently. Everything else (attachments,
keyword filters, twit lists, requests) is optional.

---

## 8. Round-trip pseudocode outline (non-normative)

**Read a QWK packet:**
1. Unzip. Read `CONTROL.DAT` → BBS metadata + conference map (§1).
2. Open `MESSAGES.DAT`; skip block 0 (producer, §2.1).
3. Loop: read 128-byte header (§2.2); note its absolute byte offset; read
   `(blocks−1)` text blocks; decode `0xE3` → newline, CP437 → Unicode (§2.3).
4. If `HEADERS.DAT` present, look up `[<hexOffset>]` for the message; override
   To/From/Subject with full values; read `Message-ID`/`In-Reply-To`/`Utf8` (§5).
   If UTF-8 flagged, re-decode that message's body/headers as UTF-8.
5. Thread via `Message-ID`/`In-Reply-To`, else via reference field (108) (§5.4).
6. `PERSONAL.NDX` (optional) → messages addressed to the user (§3).

**Write a REP:**
1. Build `<BBSID>.MSG`: block 0 = BBSID (§6.1).
2. Per reply: header block with correct conference number (123, LE), reference
   number (108) = parent msg number, blocks = `1+ceil(len/128)`, active `0xE1`.
3. Body: Unicode → CP437, newline → `0xE3`, pad last block to 128 with spaces.
4. (Optional QWKE) emit `HEADERS.DAT` sections keyed by each reply's header-block
   hex offset, with `Message-ID`, `In-Reply-To`, `Utf8`, full `Subject`/`To`.
5. ZIP as `<BBSID>.REP`. Keep bytes stable across retries (§6.4).

---

## 9. Unit-test checklist (correctness-critical)

- `MESSAGES.DAT` header: exact offsets 0/1/8/16/21/46/71/96/108/116/122/123/125/127;
  little-endian conf number; 225/226 active byte.
- Block count semantics: includes header block (value = 1 + text blocks).
- Body `0xE3` ↔ newline both directions; last-block space padding; round-trip a
  body with multiple lines, trailing blank line, and a literal `π` in text.
- CP437 ↔ Unicode round-trip incl. box-drawing/high-ASCII; UTF-8 path when `Utf8`.
- MSBIN: the four worked examples in §3.3; `b3==0` → 0; block→byte
  `(n−1)*128`; first message = block 2 = offset 128.
- `HEADERS.DAT`: section key = hex byte-offset of header block; `[80]` for first
  message; `key:` vs `key =`; 1024-char values; numeric section matching.
- `CONTROL.DAT`: conference count = line11 + 1; pair parsing; ignore trailing junk;
  date format `MM-DD-YYYY,HH:MM:SS` (4-digit year, unlike header `MM-DD-YY`).
- Threading: numeric reference (108) vs `In-Reply-To` Message-ID.
- REP: block 0 = BBSID; conf number routing; retry-stable bytes.

---

## 10. Known ambiguities / where sources disagree (TEST THESE)

1. **Offset numbering (1-based vs 0-based).** Patrick Lee's spec and Synchronet's
   table use different bases for identical layouts. This doc is 0-based. A 1-off
   error here corrupts every field — assert against a real packet.
2. **Conference-number high byte (offset 124).** Historically ambiguous
   (filler space vs real MSB). Read as LE uint16; disambiguate against
   `CONTROL.DAT`'s max conference if needed.
3. **Number-of-blocks includes the header block.** The classic spec says yes
   (min 2). Some third-party doors reportedly count only text blocks. **Verify on a
   real ViSiON/3 packet before trusting.**
4. **`CONTROL.DAT` lines 8–9.** Purpose varies (menu file / netmail conf / `0`).
   Safe to skip; only lines 1–7 + 11 + pairs + 3 screen files matter.
5. **`HEADERS.DAT` section key casing / zero-padding.** Synchronet writes lowercase
   hex; match by numeric value to be safe. Confirm whether ViSiON/3 (via the Phase 7
   QWK Packet API) emits `HEADERS.DAT` at all, and its exact casing.
6. **Body line-break byte.** Standard `0xE3` (227); "Greek" variant uses `12`.
   Assume `0xE3` for ViSiON/3.
7. **Last-block padding byte.** Spaces vs NULs — trim both tolerantly.
8. **The "offset stored in the message-number field" claim is FALSE.** Verified
   against the Synchronet reference: the message-number field holds the message
   number; `HEADERS.DAT` linkage is via the hex section name = header-block byte
   offset. If a specific implementation deviates, treat it as non-conformant and
   test explicitly.
9. **`.NDX` reliability.** Widely buggy across doors due to the MSBIN choice.
   Prefer a sequential `MESSAGES.DAT` scan as source of truth; use `.NDX` only as
   an optimization and validate its pointers.

---

## 11. Sources (verified)

- **QWK Format — Synchronet reference** (HEADERS.DAT mechanism, field list,
  offset table, REP block-0 BBSID, encoding rules) —
  <https://wiki.synchro.net/ref:qwk> (raw: `?do=export_raw`).
- **QWK Mail Packet File Layout**, Patrick Y. Lee, v1.0 (1992) — classic 128-byte
  header offsets, CONTROL.DAT lines, NDX/MSBIN, status flags —
  <https://wmcbrine.com/mmail/specs/qwklay.html> and
  <http://textfiles.com/programming/qwk.txt>.
- **The Mysterious QWK File Format**, Mike Wren (CONTROL.DAT count−1 semantics,
  `0xE3` body encoding, NDX 5-byte record, DOOR.ID) —
  <https://wmcbrine.com/mmail/specs/qwkfoy.html>.
- **QWK specifications index** — <https://wmcbrine.com/mmail/specs/>.
- **QWKE (QWK Extended) spec**, WWIV mirror (body kludge To/From/Subject > 25,
  DOOR.ID CONTROLTYPE additions, TOREADER.EXT/TODOOR.EXT) —
  <https://github.com/wwivbbs/wwiv/blob/master/specs/qwk/qwke.txt>
  (raw: `https://raw.githubusercontent.com/wwivbbs/wwiv/master/specs/qwk/qwke.txt`).
- **MultiMail reader source** (`mmail/qwk.cc`) — reference implementation for
  `MSBINtolong`, header field access, `0xE3` line-break handling, block-pointer
  math — <https://raw.githubusercontent.com/wmcbrine/multimail/master/mmail/qwk.cc>.
- **Microsoft Binary Format** (32-bit single layout, exponent bias 128, implied
  bit) — <https://en.wikipedia.org/wiki/Microsoft_Binary_Format>.
- **ENiGMA½ BBS — QWK support** (confirms Synchronet HEADERS.DAT / UTF-8 / @-kludge
  extensions are the interop target) —
  <https://nuskooler.github.io/enigma-bbs/messageareas/qwk.html>.
- **QWK (file format) — Wikipedia** (overview, NDX/MSBIN criticism) —
  <https://en.wikipedia.org/wiki/QWK_(file_format)>.

*Last verified: 2026-07-01.*
