import { wrapText } from './wrap';
import { stripColorCodes } from './colorText';

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
  // Quote the words, not the colour codes: a reply must not re-emit the
  // parent's ANSI/pipe markup inside "> " lines.
  const quoted = wrapText(stripColorCodes(parentBody), 79, prefix);
  return `${attributionLine(parentAuthor)}\n${quoted}`;
}
