import { Platform } from 'react-native';
import { formatTagline } from '../qwk/tagline';
import { APP_VERSION } from '../appMeta';

/**
 * The tag line for the current device. Uses the real OS (Platform.OS), NOT the
 * settings.platform demo toggle. Isolated here so the pure qwk/ modules stay
 * free of react-native imports (and Node-testable).
 */
export function currentTagline(): string {
  const platform: 'iOS' | 'Android' = Platform.OS === 'android' ? 'Android' : 'iOS';
  return formatTagline(APP_VERSION, platform);
}
