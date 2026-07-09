/**
 * Hard-wrap text to a fixed column width. Classic QWK/REP boards expect lines of
 * at most ~79 columns, so wrap before packing. Word-aware; a single token longer
 * than the usable width is hard-broken. An optional `prefix` (e.g. a quote
 * marker) is applied to every produced line and counts toward `width`, so quoted
 * lines and their continuations stay within the limit.
 *
 * Leading whitespace on an input line (indentation — code, lists, ASCII art, or
 * a quote attribution's leading space) is preserved on the FIRST output line
 * produced for that input line; it counts toward that line's width budget and
 * is capped at `avail - 1` columns so at least one content column always
 * remains. Continuation lines created by re-wrapping only carry `prefix`, not
 * the original indent. A line that is whitespace-only (nothing left after the
 * indent is stripped) collapses to a blank line, same as an empty input line.
 */
export function wrapText(text: string, width = 79, prefix = ''): string {
  const avail = Math.max(1, width - prefix.length);
  const out: string[] = [];

  for (const line of text.split('\n')) {
    if (line.length === 0) {
      out.push(prefix.trimEnd()); // blank line (drop the prefix's trailing space)
      continue;
    }

    const indent = line.match(/^[ \t]*/)![0];
    const rest = line.slice(indent.length);
    if (rest.length === 0) {
      out.push(prefix.trimEnd()); // whitespace-only line collapses to blank
      continue;
    }

    // Cap the re-emitted indent so at least one content column survives.
    const cappedIndent = indent.length >= avail ? indent.slice(0, avail - 1) : indent;
    const availFirst = avail - cappedIndent.length;

    let cur = '';
    let firstLineEmitted = false;
    const capacity = () => (firstLineEmitted ? avail : availFirst);
    const flush = () => {
      out.push(prefix + (firstLineEmitted ? '' : cappedIndent) + cur);
      firstLineEmitted = true;
      cur = '';
    };
    for (let word of rest.split(' ')) {
      while (word.length > capacity()) {
        if (cur.length > 0) flush();
        const cap = capacity();
        out.push(prefix + (firstLineEmitted ? '' : cappedIndent) + word.slice(0, cap));
        firstLineEmitted = true;
        word = word.slice(cap);
      }
      if (cur.length === 0) cur = word;
      else if (cur.length + 1 + word.length <= capacity()) cur += ' ' + word;
      else {
        flush();
        cur = word;
      }
    }
    flush();
  }
  return out.join('\n');
}
