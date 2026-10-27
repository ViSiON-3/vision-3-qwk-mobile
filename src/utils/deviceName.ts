/**
 * The name this phone registers with when pairing — what the user sees in the
 * board's device list ("which one is the old phone?"). Built from what
 * react-native's Platform exposes; no extra native dependency. Pure (no RN
 * import) so it runs in Node tests; `defaultDeviceName.ts` binds it to Platform.
 */

const APP = 'ViSiON/3 QWK Mobile';
/** The server trims names to 64 chars; stay under it so nothing is cut mid-word. */
export const MAX_DEVICE_NAME = 64;

/** Pure: pick a name from an OS id and Platform.constants-like fields. */
export function deviceNameFor(os: string, constants: Record<string, unknown> = {}): string {
  let device: string;
  if (os === 'ios') {
    device = constants.interfaceIdiom === 'pad' ? 'iPad' : 'iPhone';
  } else if (os === 'android') {
    const brand = typeof constants.Brand === 'string' ? constants.Brand.trim() : '';
    const model = typeof constants.Model === 'string' ? constants.Model.trim() : '';
    const parts = [brand, model].filter(Boolean);
    // Avoid "Google Google Pixel" when the model already names the brand.
    if (parts.length === 2 && model.toLowerCase().startsWith(brand.toLowerCase())) parts.shift();
    device = parts.length ? capitalize(parts.join(' ')) : 'Android phone';
  } else {
    device = os ? capitalize(os) : 'Device';
  }
  return `${device} · ${APP}`.slice(0, MAX_DEVICE_NAME);
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
