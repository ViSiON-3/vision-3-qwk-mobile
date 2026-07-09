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
