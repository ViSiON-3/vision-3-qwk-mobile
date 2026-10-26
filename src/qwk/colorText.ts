/**
 * BBS colour markup -> attributed text segments.
 *
 * Message bodies carry two kinds of colour codes that a terminal would
 * interpret: ANSI SGR escapes ("ESC[1;37m") and ViSiON/Renegade pipe codes
 * ("|15", "|B4", "|23"). Bodies are CP437-decoded, so the ESC byte usually
 * arrives as its CP437 glyph "←" (U+2190); both forms are accepted.
 *
 * The pipe-code table mirrors internal/ansi/ansi.go on the server so the app
 * colours a message exactly as the terminal does. Non-colour sequences (cursor
 * moves, clears) are dropped.
 */

/** One run of text with a CGA/VGA 16-colour attribute. */
export interface ColorSegment {
  text: string;
  /** 0–15 foreground; 7 = default light grey. */
  fg: number;
  /** 0–15 background; 0 = default (transparent). */
  bg: number;
}

const DEFAULT_FG = 7;
const DEFAULT_BG = 0;

/** |00–|15 -> foreground index (the table is the identity; kept for clarity). */
const PIPE_FG = /^\|(0\d|1[0-5])/;
/** |B0–|B15 -> background index. */
const PIPE_BG = /^\|B(1[0-5]|\d)/;
/** Pipe codes with no visual effect on a message body. */
const PIPE_DROP = /^\|(CL|DE|PP|P)/;

const ESC = '\u001b';
const ESC_GLYPH = '←';

/** CSI sequence body: parameters then a final byte in @–~ (0x40–0x7E). */
const CSI = /^\[([0-9;?]*)([@-~])/;

/** Parse a body into colour segments. Adjacent runs with equal attributes are merged. */
export function parseColorText(text: string): ColorSegment[] {
  const out: ColorSegment[] = [];
  let fg = DEFAULT_FG;
  let bg = DEFAULT_BG;
  let buf = '';

  const flush = () => {
    if (buf.length === 0) return;
    const last = out[out.length - 1];
    if (last && last.fg === fg && last.bg === bg) last.text += buf;
    else out.push({ text: buf, fg, bg });
    buf = '';
  };
  const setAttr = (nextFg: number, nextBg: number) => {
    if (nextFg === fg && nextBg === bg) return;
    flush();
    fg = nextFg;
    bg = nextBg;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // --- ANSI escape sequences ---
    if (ch === ESC || ch === ESC_GLYPH) {
      const m = CSI.exec(text.slice(i + 1, i + 40));
      if (m) {
        if (m[2] === 'm') {
          const next = applySgr(m[1], fg, bg);
          setAttr(next.fg, next.bg);
        }
        // Any other CSI (cursor movement, erase…) is dropped.
        i += 1 + m[0].length;
        continue;
      }
      if (ch === ESC) {
        i += 1; // bare ESC: drop
        continue;
      }
      // A "←" that is not followed by a CSI is just the arrow glyph.
    }

    // --- Pipe codes ---
    if (ch === '|') {
      const rest = text.slice(i, i + 4);
      if (rest.startsWith('||')) {
        buf += '|';
        i += 2;
        continue;
      }
      const bgm = PIPE_BG.exec(rest);
      if (bgm) {
        setAttr(fg, Number(bgm[1]));
        i += bgm[0].length;
        continue;
      }
      const fgm = PIPE_FG.exec(rest);
      if (fgm) {
        setAttr(Number(fgm[1]), bg);
        i += 3;
        continue;
      }
      if (rest.startsWith('|23')) {
        setAttr(DEFAULT_FG, DEFAULT_BG);
        i += 3;
        continue;
      }
      if (rest.startsWith('|CR')) {
        buf += '\n';
        i += 3;
        continue;
      }
      const dm = PIPE_DROP.exec(rest);
      if (dm) {
        i += dm[0].length;
        continue;
      }
      // Not a pipe code: literal bar.
    }

    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

/**
 * ANSI numbers its base colours black, red, green, yellow, blue, magenta, cyan,
 * white (30–37), while CGA/pipe codes use black, blue, green, cyan, red,
 * magenta, brown, grey (|00–|07). Map ANSI order onto CGA indices.
 */
const ANSI_TO_CGA = [0, 4, 2, 6, 1, 5, 3, 7];

/** xterm's first 16 colours follow ANSI order too (8–15 are the bright set). */
function xterm16ToCga(n: number): number {
  return n < 8 ? ANSI_TO_CGA[n] : 8 + ANSI_TO_CGA[n - 8];
}

/** Apply an SGR parameter list to the current attributes. */
function applySgr(params: string, fg: number, bg: number): { fg: number; bg: number } {
  const codes = params === '' ? [0] : params.split(';').map((p) => (p === '' ? 0 : Number(p)));
  for (let k = 0; k < codes.length; k++) {
    const c = codes[k];
    if (Number.isNaN(c)) continue;
    if (c === 0) {
      fg = DEFAULT_FG;
      bg = DEFAULT_BG;
    } else if (c === 1) {
      fg |= 8; // bold = bright foreground on a CGA terminal
    } else if (c === 2 || c === 22) {
      fg &= 7;
    } else if (c >= 30 && c <= 37) {
      fg = (fg & 8) | ANSI_TO_CGA[c - 30];
    } else if (c === 39) {
      fg = DEFAULT_FG;
    } else if (c >= 90 && c <= 97) {
      fg = 8 + ANSI_TO_CGA[c - 90];
    } else if (c >= 40 && c <= 47) {
      bg = ANSI_TO_CGA[c - 40];
    } else if (c === 49) {
      bg = DEFAULT_BG;
    } else if (c >= 100 && c <= 107) {
      bg = 8 + ANSI_TO_CGA[c - 100];
    } else if ((c === 38 || c === 48) && codes[k + 1] === 5) {
      // 256-colour form: only the first 16 have a CGA equivalent.
      const n = codes[k + 2];
      if (n !== undefined && n >= 0 && n <= 15) {
        if (c === 38) fg = xterm16ToCga(n);
        else bg = xterm16ToCga(n);
      }
      k += 2;
    }
    // Other attributes (blink, reverse, underline…) are ignored.
  }
  return { fg, bg };
}

/** The body with every colour/control code removed (previews, quoting, search). */
export function stripColorCodes(text: string): string {
  return parseColorText(text)
    .map((s) => s.text)
    .join('');
}

/** True if the text contains any colour or control markup. */
export function hasColorCodes(text: string): boolean {
  const segs = parseColorText(text);
  return segs.length > 1 || (segs.length === 1 && (segs[0].fg !== DEFAULT_FG || segs[0].bg !== DEFAULT_BG)) || stripColorCodes(text) !== text;
}
