import { initialsFor, buildQuote } from './quote';

describe('initialsFor', () => {
  it('uses first+last token initials for multi-word names', () => {
    expect(initialsFor('John Doe')).toBe('JD');
    expect(initialsFor('a b c')).toBe('AC');
  });

  it('uses the first two alphanumerics for a single handle', () => {
    expect(initialsFor('avon')).toBe('AV');
    expect(initialsFor('x')).toBe('X');
  });

  it('falls back to ? for empty/blank input', () => {
    expect(initialsFor('   ')).toBe('?');
  });
});

describe('buildQuote', () => {
  it('prepends an attribution line and prefixes each quoted line', () => {
    const out = buildQuote('line one\nline two', 'avon');
    const lines = out.split('\n');
    expect(lines[0]).toBe(' avon wrote:');
    expect(lines[1]).toBe('AV> line one');
    expect(lines[2]).toBe('AV> line two');
  });

  it('wraps long quoted lines to 79 including the prefix', () => {
    const out = buildQuote('w '.repeat(60).trim(), 'avon'); // ~119 chars
    for (const line of out.split('\n').slice(1)) {
      expect(line.length).toBeLessThanOrEqual(79);
      expect(line.startsWith('AV> ')).toBe(true);
    }
  });
});
