import { Platform } from 'react-native';
import { deviceNameFor } from './deviceName';

/** This phone's pairing name, from react-native's Platform. */
export function defaultDeviceName(): string {
  return deviceNameFor(Platform.OS, (Platform.constants ?? {}) as Record<string, unknown>);
}
