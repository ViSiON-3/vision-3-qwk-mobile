/**
 * Reader tag line, appended tearline-style to every composed message so readers
 * on any board can see which client produced it. Pure/deterministic — the
 * version/platform values are resolved by the caller (see store/appTagline.ts).
 */

/** `--- ViSiON QWK Editor v<version> (<platform>)`. */
export function formatTagline(version: string, platform: string): string {
  return `--- ViSiON QWK Editor v${version} (${platform})`;
}

/**
 * Display label for a react-native `Platform.OS` value. Known targets get
 * their proper casing; anything else is capitalized as-is so an unexpected
 * platform never masquerades as iOS in uploaded tearlines.
 */
export function platformLabel(os: string): string {
  if (os === 'ios') return 'iOS';
  if (os === 'android') return 'Android';
  return os.charAt(0).toUpperCase() + os.slice(1);
}

/**
 * Append `tagline` as the final line of `body`, separated by exactly one blank
 * line. Trailing newlines on `body` are collapsed first so spacing is always a
 * single blank line. An empty tagline is a no-op (keeps re-upload bytes stable);
 * an empty body yields just the tagline.
 */
export function appendTagline(body: string, tagline: string): string {
  if (!tagline) return body;
  const trimmed = body.replace(/\n+$/, '');
  return trimmed.length === 0 ? tagline : `${trimmed}\n\n${tagline}`;
}
