# QWK-TLS Android Parity — Design

**Date:** 2026-07-09
**Status:** Approved for implementation
**Scope:** Android (Kotlin) side of the `modules/qwk-tls` Expo native module.

## Problem

The `qwk-tls` module is iOS-only (`modules/qwk-tls/ios/QwkTlsModule.swift`). On
Android, `getNativeQwkTls()` returns null, so pinned boards fail with
`PinningUnavailableError` ("TLS pinning needs a development build") and packet
downloads cannot stream to disk. Android needs a Kotlin implementation with the
**same JS contract** consumed by `src/native/QwkTls.ts` and
`src/api/pinnedFetch.ts` — the JS layer must not change.

## JS contract (fixed, from `src/native/QwkTls.ts`)

Module name `QwkTls`, exposing:

1. `request(options) → Promise<{ status, headers, bodyBase64 }>`
   - `options`: `{ url, method, headers: Record<string,string>, bodyUtf8?,
     bodyBase64?, pinnedSha256 }` (`bodyUtf8` / `bodyBase64` mutually
     exclusive; `pinnedSha256` is 64 upper-hex chars, pre-normalized by JS).
   - `headers` in the response is a **plain string map**; `bodyBase64` may be
     empty (204).
2. `getFingerprint(host, port) → Promise<string>` — TOFU probe; resolves the
   server leaf cert's SHA-256. JS re-normalizes via `normalizeFingerprint()`,
   so any hex casing is acceptable, but we return bare upper-hex for parity.
3. `downloadToFile(options, destPath, requestId) → Promise<result>`
   - `options`: `{ url, method?, headers, pinnedSha256 }`; `destPath` is an
     absolute filesystem path **without** a `file://` scheme (see
     `packetFilePath()` in `src/storage/packetCache.ts`).
   - On HTTP 200: `{ status: 200, headers, bytesWritten }` — body is on disk,
     never crosses the bridge.
   - Non-200 (204 / errors): `{ status, headers, bodyBase64 }` — the small
     body so JS maps 204/JSON errors like a normal fetch.
4. Event `onDownloadProgress` with payload `{ id, written, total }`, where
   `id` echoes the `requestId` argument and `total` is `0` when unknown
   (never negative — matches the iOS normalization of `-1`).

Error rejection codes match iOS: `QWK_TLS_ARGS` (bad arguments),
`QWK_TLS_REQUEST` (transport/TLS failure in `request`), `QWK_TLS_PROBE`
(probe failure), `QWK_TLS_DOWNLOAD` (download transport/TLS/file failure).
JS does not branch on codes today, but parity keeps future handling uniform.

## Approach

**OkHttp for `request` + `downloadToFile`; a raw `SSLSocket` handshake for the
TOFU probe.** OkHttp already ships with React Native on Android (declared
explicitly in the module's gradle anyway). Alternatives rejected:

- *OkHttp for the probe too*: needs a capturing trust manager plus careful
  cancellation so no HTTP request ever completes over the untrusted
  connection — the exact settle-before-cancel race that bd1f9ce fixed on iOS.
  A bare handshake sidesteps the whole class of bugs: there is no request.
- *`HttpsURLConnection` everywhere*: no dependency win (OkHttp is present
  regardless), clunkier streaming and error surfaces.

## Components (all in `modules/qwk-tls/android`)

Package `expo.modules.qwktls`, files under `src/main/java/expo/modules/qwktls/`.

### `QwkTlsModule.kt` — module definition

- `Name("QwkTls")`, `Events("onDownloadProgress")`.
- `AsyncFunction("request") { options: RequestOptions, promise: Promise }`
- `AsyncFunction("getFingerprint") { host: String, port: Int, promise: Promise }`
- `AsyncFunction("downloadToFile") { options: DownloadOptions, destPath: String, requestId: String, promise: Promise }`
  — forwards progress to `sendEvent("onDownloadProgress", …)`.
- Options decoded as Expo `Record` classes (`RequestOptions`,
  `DownloadOptions`) so malformed args reject with `QWK_TLS_ARGS`-equivalent
  conversion errors rather than crashing.

### Pinning core (`Pinning.kt`)

- `leafSha256Hex(cert: X509Certificate): String` — upper-hex SHA-256 of the
  leaf certificate **DER** (`cert.encoded`) — identical bytes to what iOS
  hashes (`SecCertificateCopyData`) and what the sysop pins.
- `PinnedTrustManager(pinnedSha256)` — an `X509TrustManager` whose
  `checkServerTrusted` sanitizes the pin (upper-case, hex-only — mirroring the
  Swift `uppercased().filter(isHexDigit)`), then **fails closed** by throwing
  `CertificateException` unless the pin is exactly 64 hex chars and equals the
  leaf's SHA-256. No CA validation — the pin *is* the trust decision, exactly
  like the iOS `pinnedChallengeDisposition`.
- Hostname verification is replaced by the pin (`HostnameVerifier` returning
  true on pinned connections) — same semantics as iOS accepting the trust with
  `URLCredential(trust:)`; a self-signed BBS cert generally won't match the
  hostname, and the fingerprint is the stronger check.
- `client(pinnedSha256, connectTimeout, readTimeout): OkHttpClient` — builds a
  per-call client with the pinned socket factory. Redirects: OkHttp's default
  (follow) is acceptable — pinning applies to every connection the client
  makes, and same-host API redirects are the only realistic case; iOS
  URLSession likewise follows redirects with the same pinned delegate.

### `request` path

- Build OkHttp `Request` from options: method (default GET), headers, body
  from `bodyUtf8` (UTF-8 bytes) else `bodyBase64` (decoded) else none. OkHttp
  requires a body for POST — send an empty body when the method demands one.
- Timeouts: connect 30 s, read/write 30 s (iOS `timeoutInterval = 30`).
- Async via `enqueue`; on response, resolve
  `{ status, headers: multimap collapsed with ", ", bodyBase64 }` (body read
  fully — the request path is for small JSON/REP payloads by design).
- On `IOException` (includes `SSLPeerUnverifiedException` /
  `SSLHandshakeException` from a pin mismatch): reject `QWK_TLS_REQUEST`.

### `getFingerprint` path (TOFU probe)

- Validate `port` in 1..65535 else reject `QWK_TLS_ARGS`.
- On a background thread: `SSLSocket` to `(host, port)` with an
  accept-anything trust manager, SNI set (default when constructing with a
  hostname), 15 s connect/handshake timeout (iOS probe `timeoutInterval = 15`).
- `startHandshake()`, read `session.peerCertificates[0]` as
  `X509Certificate`, hash with `leafSha256Hex`, close the socket, resolve.
  **The socket is never used for any I/O** — capture-and-close, so the
  "never trust the connection" guarantee is structural, not sequenced.
- Failures (connect refused, timeout, non-TLS peer, no cert): reject
  `QWK_TLS_PROBE` with the underlying message, or "no certificate presented"
  when the chain is empty/unreadable.

### `downloadToFile` path

- Pinned OkHttp GET (method from options), connect 30 s, read 120 s (between
  bytes — closest analogue of the iOS download `timeoutInterval = 120`).
- Stream `response.body.byteStream()` to `destPath + ".part"` in the dest
  directory (parents created), 64 KiB buffer; after each chunk invoke the
  progress callback with `(totalWritten, max(0, contentLength))`. Writing the
  temp file **next to** the destination (not the system temp dir) keeps the
  final `rename` atomic on one filesystem — same effect as the iOS
  move-before-delegate-returns rule.
- On HTTP 200: delete any existing dest, rename `.part` → dest, resolve
  `{ status: 200, headers, bytesWritten }` (actual bytes streamed).
- Non-200: read the (small) body into memory, resolve
  `{ status, headers, bodyBase64 }`; no file is left behind.
- Any failure (TLS/pin, transport, file I/O, rename): delete the `.part`
  file, reject `QWK_TLS_DOWNLOAD`.

## Packaging

- `modules/qwk-tls/expo-module.config.json`: `platforms: ["apple","android"]`,
  `android.modules: ["expo.modules.qwktls.QwkTlsModule"]`.
- `modules/qwk-tls/android/build.gradle`: SDK-57 local-module conventions
  (`com.android.library` + `expo-module-gradle-plugin` plugins block,
  `namespace "expo.modules.qwktls"`), explicit
  `implementation 'com.squareup.okhttp3:okhttp:4.12.0'` (gradle resolves to
  RN's aligned version).
- `AndroidManifest.xml`: empty manifest (namespace lives in gradle).
- The app's `android/` directory stays gitignored (generated by prebuild);
  only `modules/qwk-tls/android/**` is committed — same layout as iOS.

## Testing & verification

- **JS contract is unchanged** — the existing `pinnedFetch.test.ts`,
  `fingerprint.test.ts`, `qwkApi.test.ts` suites remain the Node-testable
  contract. Full suite + typecheck must stay green.
- Add a small Node test asserting cross-file consistency of the module
  packaging: `expo-module.config.json` declares both platforms and the
  Android module class matches the committed Kotlin file's package/class
  (guards silent breakage of autolinking).
- **Native behavior cannot be compiled or run here** (no Android SDK/JDK on
  this machine): the Kotlin path needs `npx expo run:android` on a dev build
  against a live ViSiON/3 instance — probe fingerprint vs `openssl s_client`,
  pinned round trip, pin-mismatch fail-closed, streamed download progress,
  interrupted-download cleanup. The PR must list these as pending device
  verification, honestly.

## Out of scope

- Any JS-layer change beyond the new packaging test.
- Upload streaming (REP uploads are small; the in-memory `request` path is by
  design).
- Certificate-transparency / CA validation (pin-or-fail is the product model).
