# Device Pairing Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-27-device-pairing-design.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pair the phone once with handle/password, then log in to the QWK API by signing server challenges with a hardware‑backed P‑256 key. Never persist the password.

### Task 1: Native device key (iOS + Android) — `modules/qwk-tls`
- [ ] `ios/QwkDeviceKey.swift`: Secure Enclave P‑256 (software fallback), SPKI export, DER ECDSA‑SHA256 signing, has/delete.
- [ ] `android/.../DeviceKey.kt`: Android Keystore P‑256 (StrongBox → TEE), SPKI export, `SHA256withECDSA`, has/delete.
- [ ] Register the four functions in both module definitions.
- [ ] Verify: `xcodebuild` of the iOS dev client compiles; Kotlin reviewed.

### Task 2: Protocol client
- [ ] `errors.ts`: `QwkDeviceUnpairedError`; rate‑limit error keeps server code.
- [ ] `qwkApi.ts`: pair/list/delete devices, challenge, login/device, logout; `scope` on login.
- [ ] `deviceLogin.ts`: signed message bytes. Tests for all of the above.

### Task 3: Signer + session + pairing
- [ ] `deviceKey.ts`: `DeviceSigner`, native signer, alias helper.
- [ ] `session.ts`: device login with challenge retry, unpaired error, logout, device management.
- [ ] `pairing.ts`: `pairDevice`, `loginForPairing`. Tests with a fake signer.

### Task 4: Store + net
- [ ] `Board.pairing` replaces `pass`; legacy keychain purge; `connect(password?)`; `forgetPairing`; logout on sign‑out.
- [ ] `net.ts`: `makeClient`, `makeSession` from pairing; `describeSyncError` for new codes. Tests.

### Task 5: UI
- [ ] Connect: password field when unpaired, "PAIR & DIAL IN", "Manage devices ›".
- [ ] BoardForm: drop password; pairing status; Forget pairing.
- [ ] Devices screen + Settings row + navigation types.
- [ ] `deviceName.ts` default device name.

### Task 6: Docs
- [ ] PHASE8‑KICKOFF API contract, README, CLAUDE.md principle, this plan ticked.
