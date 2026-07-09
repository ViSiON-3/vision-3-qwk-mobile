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
