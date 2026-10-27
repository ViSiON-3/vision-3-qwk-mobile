# Device Pairing Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-27-device-pairing-design.md`. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Pair the phone once with handle/password, then log in to the QWK API by signing server challenges with a hardware‑backed P‑256 key. Never persist the password.

### Task 1: Native device key (iOS + Android) — `modules/qwk-tls`
- [x] `ios/QwkDeviceKey.swift`: Secure Enclave P‑256 (software fallback), SPKI export, DER ECDSA‑SHA256 signing, has/delete.
- [x] `android/.../DeviceKey.kt`: Android Keystore P‑256 (StrongBox → TEE), SPKI export, `SHA256withECDSA`, has/delete.
- [x] Register the four functions in both module definitions.
- [x] Verify: `xcodebuild` compiles the QwkTls Swift target cleanly (the simulator app link step fails on main too — react-native-screens vs the prebuilt RN core, unrelated); Kotlin reviewed, on-device verification pending.

### Task 2: Protocol client
- [x] `errors.ts`: `QwkDeviceUnpairedError`; rate‑limit error keeps server code.
- [x] `qwkApi.ts`: pair/list/delete devices, challenge, login/device, logout; `scope` on login.
- [x] `deviceLogin.ts`: signed message bytes. Tests for all of the above.

### Task 3: Signer + session + pairing
- [x] `deviceKey.ts`: `DeviceSigner`, native signer, alias helper.
- [x] `session.ts`: device login with challenge retry, unpaired error, logout, device management.
- [x] `pairing.ts`: `pairDevice`, `loginForPairing`. Tests with a fake signer.

### Task 4: Store + net
- [x] `Board.pairing` replaces `pass`; legacy keychain purge; `connect(password?)`; `forgetPairing`; logout on sign‑out.
- [x] `net.ts`: `makeClient`, `makeSession` from pairing; `describeSyncError` for new codes. Tests.

### Task 5: UI
- [x] Connect: password field when unpaired, "PAIR & DIAL IN", "Manage devices ›".
- [x] BoardForm: drop password; pairing status; Forget pairing.
- [x] Devices screen + Settings row + navigation types.
- [x] `deviceName.ts` default device name.

### Task 6: Docs
- [x] PHASE8‑KICKOFF API contract, README, CLAUDE.md principle, this plan ticked.
