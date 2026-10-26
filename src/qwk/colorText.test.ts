import { parseColorText, stripColorCodes, hasColorCodes } from './colorText';

const ESC = '\u001b';

describe('parseColorText', () => {
  it('returns one default segment for plain text', () => {
    expect(parseColorText('hello')).toEqual([{ text: 'hello', fg: 7, bg: 0 }]);
    expect(parseColorText('')).toEqual([]);
  });

  it('applies ANSI SGR foreground, bold-as-bright, and reset', () => {
    const segs = parseColorText(`${ESC}[1;30m--- ${ESC}[1;37mBandit ${ESC}[0;37mSaid${ESC}[0m!`);
    expect(segs).toEqual([
      { text: '--- ', fg: 8, bg: 0 },
      { text: 'Bandit ', fg: 15, bg: 0 },
      { text: 'Said!', fg: 7, bg: 0 },
    ]);
  });

  it('accepts the CP437 glyph for ESC (U+2190) as produced by the packet decoder', () => {
    const segs = parseColorText('←[1;33mYellow←[0m plain');
    expect(segs).toEqual([
      { text: 'Yellow', fg: 14, bg: 0 },
      { text: ' plain', fg: 7, bg: 0 },
    ]);
  });

  it('keeps a lone arrow glyph that is not an escape', () => {
    expect(parseColorText('go ← back')).toEqual([{ text: 'go ← back', fg: 7, bg: 0 }]);
  });

  it('handles backgrounds, bright (90–97 / 100–107), 256-colour low indices and bold-off', () => {
    // ANSI 44 = blue background (CGA 1); 93 = bright yellow (CGA 14).
    expect(parseColorText(`${ESC}[44;93mX`)).toEqual([{ text: 'X', fg: 14, bg: 1 }]);
    // ANSI 104 = bright blue background (CGA 9).
    expect(parseColorText(`${ESC}[104mX`)).toEqual([{ text: 'X', fg: 7, bg: 9 }]);
    // xterm 12 = bright blue (CGA 9); xterm 3 = yellow/brown (CGA 6).
    expect(parseColorText(`${ESC}[38;5;12mX${ESC}[48;5;3mY`)).toEqual([
      { text: 'X', fg: 9, bg: 0 },
      { text: 'Y', fg: 9, bg: 6 },
    ]);
    expect(parseColorText(`${ESC}[1;31mA${ESC}[22mB`)).toEqual([
      { text: 'A', fg: 12, bg: 0 },
      { text: 'B', fg: 4, bg: 0 },
    ]);
    // Bold then a new base colour keeps the bright bit.
    expect(parseColorText(`${ESC}[1m${ESC}[34mX`)).toEqual([{ text: 'X', fg: 9, bg: 0 }]);
  });

  it('drops non-colour CSI sequences and bare ESC bytes', () => {
    expect(stripColorCodes(`${ESC}[2J${ESC}[H${ESC}[3;4H${ESC}[Khi${ESC}`)).toBe('hi');
  });

  it('translates ViSiON pipe codes like the server does', () => {
    const segs = parseColorText('|08s|01s|15ce|B4x|23done');
    expect(segs).toEqual([
      { text: 's', fg: 8, bg: 0 },
      { text: 's', fg: 1, bg: 0 },
      { text: 'ce', fg: 15, bg: 0 },
      { text: 'x', fg: 15, bg: 4 },
      { text: 'done', fg: 7, bg: 0 },
    ]);
    expect(parseColorText('|B12z')).toEqual([{ text: 'z', fg: 7, bg: 12 }]);
  });

  it('treats "||" as a literal bar and leaves non-codes alone', () => {
    expect(stripColorCodes('a ||b| c |ZZ |1 end|')).toBe('a |b| c |ZZ |1 end|');
  });

  it('handles |CR, |CL, |DE, |P and |PP', () => {
    expect(stripColorCodes('one|CRtwo|CL|DE|P|PP')).toBe('one\ntwo');
  });

  it('merges adjacent runs with the same attributes', () => {
    expect(parseColorText('|07a|07b|15c|15d')).toEqual([
      { text: 'ab', fg: 7, bg: 0 },
      { text: 'cd', fg: 15, bg: 0 },
    ]);
  });

  it('renders the real-world signature from the bug report', () => {
    const sig = '|08s|01s|09s|03p|11a|15ce|11m|03a|09n|01n|08n|05[|13Vi|12S|14iO|12N|13/3|05]|07';
    expect(stripColorCodes(sig)).toBe('ssspacemannn[ViSiON/3]');
  });
});

describe('hasColorCodes', () => {
  it('detects markup and ignores plain text', () => {
    expect(hasColorCodes('plain |text| here')).toBe(false);
    expect(hasColorCodes('|15bright')).toBe(true);
    expect(hasColorCodes(`${ESC}[2Jcleared`)).toBe(true);
  });
});

describe('ANSI vs pipe colour order', () => {
  it('maps ANSI 34 (blue) and pipe |01 (blue) to the same CGA index, unlike a naive 1:1 mapping', () => {
    expect(parseColorText(`${ESC}[0;34mX`)[0].fg).toBe(1);
    expect(parseColorText('|01X')[0].fg).toBe(1);
    expect(parseColorText(`${ESC}[0;31mX`)[0].fg).toBe(4); // red
    expect(parseColorText(`${ESC}[0;33mX`)[0].fg).toBe(6); // yellow/brown
    expect(parseColorText(`${ESC}[1;33mX`)[0].fg).toBe(14); // bright yellow
  });
});
