# Device Pairing (password once, then device-key login) — Design

**Date:** 2026-10-27
**Status:** Approved for implementation
**Tracks:** ViSiON-3/vision-3-qwk-mobile#24 (server side: ViSiON-3/vision-3-bbs#720 for #713)
**Protocol source:** `docs/sysop/messages/qwk-api.md` in `vision-3-bbs` (branch `feat/713-qwkapi-device-pairing`)

## Problem

The QWK API no longer hands out packet access for a password. `POST /api/qwk/login`
now returns a 10‑minute token with `scope: "pair"` that can only use the `devices`
endpoints. Packets and replies need a `scope: "device"` token, obtained by signing a
one‑time server challenge with a key that was registered ("paired") while holding a
pair token.

Today the app stores each board's password in the OS keychain and re‑logs‑in with it
on every 401. That must go: the password is typed once to pair the phone, then
discarded. The phone keeps only a hardware‑backed private key.

## Protocol (what the client implements)

| Step | Call | Notes |
|---|---|---|
| Pair 1 | `POST login` `{handle,password}` → `{token, expiresAt, scope:"pair"}` | 401 bad creds; 429 `locked_out` (+`Retry-After`); 403 `logon_level` / `intro_pending` |
| Pair 2 | `POST devices` (pair token) `{name, publicKey}` → `201 {deviceId, boardId}` | `publicKey` = base64 DER SubjectPublicKeyInfo, P‑256. 400 `bad_key`, 409 `key_exists` / `too_many_devices` |
| Login 1 | `POST challenge` `{deviceId}` → `{challenge, expiresAt}` | single use, 60 s, issued for any id |
| Login 2 | `POST login/device` `{deviceId, challenge, signature}` → `{token, expiresAt, scope:"device"}` | signature = base64 ECDSA (DER) over SHA‑256 of the UTF‑8 bytes of `ViSiON/3 QWK API device login v1\n<boardId>\n<deviceId>\n<challenge>`. 401 `challenge_invalid` → new challenge, retry; 401 `unauthorized` → no longer paired |
| Manage | `GET devices` → `[{id,name,createdAt,lastUsed,current}]`, `DELETE devices/{id}` → 204 | either scope |
| Out | `POST logout` → 204 | on sign‑out |
| Packets | `GET packet`, `POST reply` | device token only; a pair token gets 403 `device_required` |

## Decisions

1. **Key material lives in the native layer**, in the existing `QwkTls` Expo module
   (one module, one native dependency). iOS: a P‑256 key in the Secure Enclave
   (software keychain key as a fallback on the simulator). Android: a P‑256 key in
   the Android Keystore (StrongBox when available, TEE otherwise). The private key
   never crosses the bridge; JS only sees the SPKI public key and signatures.
   Ed25519 is not used: neither platform's hardware store signs Ed25519.
2. **One key per board**, alias `v3qwk_devkey_<board.id>`. Pairing always generates
   a fresh key (replacing the previous one) so a re‑pair after a password change
   never collides with a stale registration.
3. **The password is never persisted.** It flows `ConnectScreen → store.connect(password)
   → pairDevice()` and is dropped. The keychain password entries from earlier
   builds are deleted on hydrate.
4. **Pairing state is part of the board record** (`Board.pairing = {deviceId,
   boardId, deviceName, pairedAt}`), persisted in the AsyncStorage snapshot. The
   device id is not a secret — a challenge is useless without the private key.
5. **Session = device login.** `QwkSession` takes `{deviceId, boardId, signer}`; its
   `login()` runs challenge → sign → `login/device`, retrying once on
   `challenge_invalid`. A `401 unauthorized` there raises `QwkDeviceUnpairedError`;
   the store clears the board's pairing and Connect asks for the password again.
   The existing "re‑login once on a 401 from an authed call" behaviour stays.
6. **403 deny codes don't retry** (`logon_level`, `intro_pending`,
   `device_required`, `password_login_required`). `429 locked_out` is surfaced
   with the `Retry-After` seconds; the server code is kept on the error.
7. **Logout on sign‑out:** `disconnect`, switching boards while logged in, and
   toggling demo mode call `POST logout` best‑effort (fire and forget).
8. **Device management screen** (`Devices`): lists the active board's paired
   devices and unpairs any of them. It uses the live device session when
   logged in; otherwise (lost‑phone case, reached from Connect) it asks for the
   password, uses the resulting pair token, and logs that token out on leave.
   Unpairing *this* phone also forgets the local pairing + key and disconnects.
9. **Demo mode** needs no pairing: Dial In behaves as before.

## Components

### Native (`modules/qwk-tls`, module `QwkTls`)

New functions (iOS Swift `ios/QwkDeviceKey.swift`, Android Kotlin `DeviceKey.kt`):

- `generateDeviceKey(alias) → {publicKey: base64 SPKI DER, algorithm: "P-256", hardwareBacked: bool}` — replaces any key under `alias`.
- `signWithDeviceKey(alias, messageBase64) → base64 DER ECDSA‑SHA256 signature`.
- `hasDeviceKey(alias) → bool`; `deleteDeviceKey(alias)` (no‑op when absent).

Rejection codes: `QWK_KEY_ARGS`, `QWK_KEY_MISSING`, `QWK_KEY_GENERATE`, `QWK_KEY_SIGN`.

### JS

- `src/native/QwkTls.ts` — interface gains the four functions.
- `src/api/deviceKey.ts` — `DeviceSigner { generate(); sign(msg); delete() }`,
  `createNativeDeviceSigner(alias)`, `deviceKeyAlias(boardId)`,
  `DeviceKeyUnavailableError` (no dev build).
- `src/api/deviceLogin.ts` — `deviceLoginMessage(boardId, deviceId, challenge): Uint8Array` (pure).
- `src/api/qwkApi.ts` — `pairDevice`, `listDevices`, `deleteDevice`, `challenge`,
  `loginDevice`, `logout`; `LoginResult.scope`.
- `src/api/errors.ts` — `QwkDeviceUnpairedError`; `QwkRateLimitError` keeps the server code.
- `src/api/session.ts` — device‑key session (see decision 5) + `logout()`,
  `listDevices()`, `unpairDevice(id)`.
- `src/api/pairing.ts` — `pairDevice(client, {handle, password, deviceName, signer})`,
  `loginForPairing(client, handle, password)`.
- `src/store` — `Board.pass` removed, `Board.pairing` added; `connect(password?)`,
  `forgetPairing(boardId)`, logout on sign‑out; legacy keychain purge.
- `src/utils/deviceName.ts` — default device name from `Platform`.
- Screens: Connect (password field when unpaired, "PAIR & DIAL IN"), BoardForm
  (no password; pairing status + Forget pairing), Devices (new), Settings row.

## Testing

Jest (Node): protocol client for every new endpoint and error code; session
login/retry/unpaired paths with a fake signer; the signed‑message bytes; pairing
flow; error descriptions; store‑free `net` helpers. Native code cannot be
unit‑tested here; iOS is verified by an `xcodebuild` of the dev client, Android by
review (no SDK on this machine) and listed in the PR for on‑device verification.
