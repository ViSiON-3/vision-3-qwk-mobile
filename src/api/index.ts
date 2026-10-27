/** QWK Packet API client — public surface. */
export { createQwkClient, MAX_REP_BYTES } from './qwkApi';
export type { QwkClient } from './qwkApi';
export { QwkSession } from './session';
export type { DeviceCredentials } from './session';
export { pairDevice, loginForPairing } from './pairing';
export type { PairRequest, PairToken } from './pairing';
export { createNativeDeviceSigner, deviceKeyAlias, DeviceKeyUnavailableError, DeviceKeyMissingError } from './deviceKey';
export type { DeviceSigner } from './deviceKey';
export { deviceLoginMessage } from './deviceLogin';
export { QwkApiError, QwkAuthError, QwkDeviceUnpairedError, QwkRateLimitError } from './errors';
export {
  createPinnedFetch,
  createPinnedDownloadToFile,
  probeServerFingerprint,
  PinningUnavailableError,
} from './pinnedFetch';
export { normalizeFingerprint, isValidFingerprint, formatFingerprint, fingerprintsEqual } from './fingerprint';
export type {
  LoginResult,
  TokenScope,
  PairResult,
  ChallengeResult,
  PairedDevice,
  DownloadResult,
  DownloadToFileResult,
  DownloadProgress,
  UploadResult,
  QwkClientConfig,
  FetchLike,
  FetchResponseLike,
  DownloadToFileLike,
  StreamResponseLike,
} from './types';
