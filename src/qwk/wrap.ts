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
