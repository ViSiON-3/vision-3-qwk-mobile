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
