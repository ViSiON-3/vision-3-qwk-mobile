import { formatTagline, appendTagline, platformLabel } from './tagline';

describe('formatTagline', () => {
  it('renders the verbatim tearline', () => {
    expect(formatTagline('0.1.0', 'iOS')).toBe('--- ViSiON QWK Editor v0.1.0 (iOS)');
    expect(formatTagline('1.2.3', 'Android')).toBe('--- ViSiON QWK Editor v1.2.3 (Android)');
  });
});

describe('platformLabel', () => {
  it('maps RN Platform.OS values to their display labels', () => {
    expect(platformLabel('ios')).toBe('iOS');
    expect(platformLabel('android')).toBe('Android');
    expect(platformLabel('web')).toBe('Web');
  });

  it('capitalizes unknown platforms instead of mislabeling them as iOS', () => {
    expect(platformLabel('macos')).toBe('Macos');
  });
});

describe('appendTagline', () => {
  const tag = '--- ViSiON QWK Editor v0.1.0 (iOS)';

  it('appends after exactly one blank line', () => {
    expect(appendTagline('Hello world', tag)).toBe(`Hello world\n\n${tag}`);
  });

  it('collapses trailing newlines to a single blank-line separator', () => {
    expect(appendTagline('Hello\n\n\n', tag)).toBe(`Hello\n\n${tag}`);
  });

  it('returns just the tagline for an empty body', () => {
    expect(appendTagline('', tag)).toBe(tag);
  });

  it('is a no-op when the tagline is empty (keeps existing bytes stable)', () => {
    expect(appendTagline('Hello', '')).toBe('Hello');
  });
});
