/**
 * Server TLS certificate fingerprint helpers. The QWK API's default cert is
 * self-signed; the app pins its SHA-256 fingerprint SSH-host-key style (the
 * sysop reads it from the BBS startup log / trust-on-first-use).
 */

/** Strip separators and up-case → bare hex (e.g. "44F8BB..."). */
export function normalizeFingerprint(fp: string): string {
  return fp.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
}

/** True when the value is a full SHA-256 (32 bytes / 64 hex chars). */
export function isValidFingerprint(fp: string): boolean {
  return /^[0-9A-F]{64}$/.test(normalizeFingerprint(fp));
}

/** Group into colon-separated byte pairs for display (44:F8:BB:...). */
export function formatFingerprint(fp: string): string {
  const n = normalizeFingerprint(fp);
  return n.match(/.{1,2}/g)?.join(':') ?? n;
}

/** True when two fingerprints are the same cert, ignoring separators/case.
 * Two blank/empty values are not considered equal (nothing to compare). */
export function fingerprintsEqual(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeFingerprint(a ?? '');
  const nb = normalizeFingerprint(b ?? '');
  return na.length > 0 && na === nb;
}
