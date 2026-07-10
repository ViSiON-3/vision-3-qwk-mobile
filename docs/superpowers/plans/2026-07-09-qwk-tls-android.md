# QWK-TLS Android Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Android (Kotlin) side of the `modules/qwk-tls` Expo module with the exact JS contract the iOS side already serves, so pinned boards and streamed downloads work on Android dev builds.

**Architecture:** Three native operations behind one Expo module named `QwkTls`: a TOFU fingerprint probe (raw `SSLSocket` handshake — capture leaf cert SHA-256, close, never send a request), a pinned `request` (OkHttp with a custom `X509TrustManager` that trusts iff the leaf cert DER SHA-256 equals the pin), and a pinned `downloadToFile` that streams to `destPath + ".part"` then renames, emitting `onDownloadProgress` events. Spec: `docs/superpowers/specs/2026-07-09-qwk-tls-android-design.md`.

**Tech Stack:** Kotlin, Expo Modules API (SDK 57 conventions), OkHttp 4.x, Jest (Node) for the packaging-consistency test.

## Global Constraints

- The JS contract in `src/native/QwkTls.ts` and `src/api/pinnedFetch.ts` is **fixed** — no JS behavior changes.
- Fingerprints: SHA-256 over the leaf certificate **DER** bytes, upper-hex, no separators (matches iOS `leafSha256Hex` and `src/api/fingerprint.ts`).
- Pin check **fails closed**: sanitize the pin (upper-case, hex chars only, mirroring Swift `uppercased().filter(isHexDigit)`); reject unless exactly 64 hex chars and equal to the leaf hash.
- Rejection codes: `QWK_TLS_ARGS`, `QWK_TLS_REQUEST`, `QWK_TLS_PROBE`, `QWK_TLS_DOWNLOAD` (same as iOS).
- Timeouts: request 30 s; probe 15 s; download connect 30 s / read 120 s.
- `destPath` has no `file://` scheme; on 200 the body must never enter memory or cross the bridge.
- Numeric values crossing the bridge (`bytesWritten`, progress `written`/`total`) are sent as **Double** — React Native's argument conversion does not accept `Long`.
- `total` in progress events is `max(0, contentLength)` — never negative.
- No Android SDK/JDK is available on this machine: Kotlin cannot be compiled here. Every Kotlin task's "verify" step is `npx tsc --noEmit` + `npx jest` staying green (proves no JS regression) plus careful review; on-device verification is deferred and must be listed in the PR.
- Kotlin package: `expo.modules.qwktls`; sources under `modules/qwk-tls/android/src/main/java/expo/modules/qwktls/`.
- Commit after every task; conventional-commit messages.

---

### Task 1: Pinning core + TOFU probe

**Files:**
- Create: `modules/qwk-tls/android/src/main/java/expo/modules/qwktls/Pinning.kt`
- Create: `modules/qwk-tls/android/src/main/java/expo/modules/qwktls/QwkTlsProbe.kt`

**Interfaces:**
- Produces: `leafSha256Hex(cert: X509Certificate): String`, `sanitizePin(pin: String): String`, `PinnedTrustManager(pinnedSha256: String)`, `pinnedClient(pinnedSha256: String, connectTimeoutSec: Long, readTimeoutSec: Long): OkHttpClient`, `headerMap(headers: okhttp3.Headers): Map<String, String>`, `QwkTlsProbe.perform(host: String, port: Int, promise: expo.modules.kotlin.Promise)`.

- [ ] **Step 1: Write `Pinning.kt`**

```kotlin
package expo.modules.qwktls

import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager
import okhttp3.Headers
import okhttp3.OkHttpClient

/** Upper-hex SHA-256 of a certificate's DER bytes — the same bytes iOS hashes
 * (SecCertificateCopyData), so a fingerprint captured on either platform
 * matches later pinned connections on both. */
fun leafSha256Hex(cert: X509Certificate): String =
  MessageDigest.getInstance("SHA-256")
    .digest(cert.encoded)
    .joinToString("") { "%02X".format(it) }

/** Sanitize a pin the way the Swift module does: upper-case, hex chars only. */
fun sanitizePin(pin: String): String =
  pin.uppercase().filter { it in "0123456789ABCDEF" }

/**
 * Trusts a server chain iff the leaf cert's SHA-256 equals the pinned value.
 * No CA validation — the pin IS the trust decision (the BBS cert is
 * self-signed by default). Fails closed on a short/invalid pin.
 */
class PinnedTrustManager(pinnedSha256: String) : X509TrustManager {
  private val pin = sanitizePin(pinnedSha256)

  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String): Unit =
    throw CertificateException("client certificates not supported")

  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
    val leaf = chain.firstOrNull() ?: throw CertificateException("no certificate presented")
    if (pin.length != 64 || leafSha256Hex(leaf) != pin) {
      throw CertificateException("server certificate does not match pinned fingerprint")
    }
  }

  override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
}

/** OkHttp client whose every TLS connection is validated by the pin alone.
 * Hostname verification is replaced by the fingerprint check — the same
 * semantics as iOS accepting the trust with URLCredential(trust:). */
fun pinnedClient(pinnedSha256: String, connectTimeoutSec: Long, readTimeoutSec: Long): OkHttpClient {
  val trustManager = PinnedTrustManager(pinnedSha256)
  val context = SSLContext.getInstance("TLS")
  context.init(null, arrayOf(trustManager), null)
  return OkHttpClient.Builder()
    .sslSocketFactory(context.socketFactory, trustManager)
    .hostnameVerifier { _, _ -> true }
    .connectTimeout(connectTimeoutSec, TimeUnit.SECONDS)
    .readTimeout(readTimeoutSec, TimeUnit.SECONDS)
    .writeTimeout(readTimeoutSec, TimeUnit.SECONDS)
    .build()
}

/** Plain string map of response headers (duplicates joined with ", "),
 * matching the shape iOS returns from allHeaderFields. */
fun headerMap(headers: Headers): Map<String, String> {
  val map = mutableMapOf<String, String>()
  for (name in headers.names()) map[name] = headers.values(name).joinToString(", ")
  return map
}
```

- [ ] **Step 2: Write `QwkTlsProbe.kt`**

```kotlin
package expo.modules.qwktls

import expo.modules.kotlin.Promise
import java.net.InetSocketAddress
import java.net.Socket
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

private const val PROBE_TIMEOUT_MS = 15_000

/** Accept-anything trust manager. Safe ONLY because the probe reads the
 * presented cert and closes — the connection never carries a request. */
private object CaptureTrustManager : X509TrustManager {
  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
  override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
}

/**
 * QwkTlsProbe — one-shot trust-on-first-use fingerprint capture. Opens a bare
 * TLS handshake (no HTTP request exists at all — stronger than the iOS probe's
 * cancelled HEAD), hashes the presented leaf cert, closes the socket, and only
 * then settles the promise, so there is no settle/teardown race by construction.
 */
object QwkTlsProbe {
  fun perform(host: String, port: Int, promise: Promise) {
    if (host.isBlank() || port <= 0 || port > 65535) {
      promise.reject("QWK_TLS_ARGS", "invalid host/port", null)
      return
    }
    Thread {
      val fingerprint = try {
        captureLeafFingerprint(host, port)
      } catch (e: Exception) {
        promise.reject("QWK_TLS_PROBE", e.message ?: "probe failed", e)
        return@Thread
      }
      if (fingerprint == null) {
        promise.reject("QWK_TLS_PROBE", "no certificate presented", null)
      } else {
        promise.resolve(fingerprint)
      }
    }.start()
  }

  /** Handshake, hash the leaf, close everything. Returns null when the peer
   * presented no readable X.509 cert. All sockets are closed before return. */
  private fun captureLeafFingerprint(host: String, port: Int): String? {
    val context = SSLContext.getInstance("TLS")
    context.init(null, arrayOf<TrustManager>(CaptureTrustManager), null)
    // Connect a plain socket first so the connect timeout applies, then wrap
    // in TLS; passing the hostname to createSocket sets SNI.
    val plain = Socket()
    try {
      plain.connect(InetSocketAddress(host, port), PROBE_TIMEOUT_MS)
      val tls = context.socketFactory.createSocket(plain, host, port, true) as SSLSocket
      tls.use { socket ->
        socket.soTimeout = PROBE_TIMEOUT_MS
        socket.startHandshake()
        val leaf = socket.session.peerCertificates.firstOrNull() as? X509Certificate
        return leaf?.let { leafSha256Hex(it) }
      }
    } finally {
      runCatching { plain.close() }
    }
  }
}
```

- [ ] **Step 3: Verify no JS regression**

Run: `npx tsc --noEmit && npx jest 2>&1 | tail -3`
Expected: typecheck clean; all suites pass (Kotlin files are invisible to both).

- [ ] **Step 4: Commit**

```bash
git add modules/qwk-tls/android
git commit -m "feat(android): qwk-tls pinning core and TOFU fingerprint probe"
```

---

### Task 2: Pinned request

**Files:**
- Create: `modules/qwk-tls/android/src/main/java/expo/modules/qwktls/Records.kt`
- Create: `modules/qwk-tls/android/src/main/java/expo/modules/qwktls/QwkTlsRequest.kt`

**Interfaces:**
- Consumes: `pinnedClient`, `headerMap` from Task 1.
- Produces: `RequestOptions`/`DownloadOptions` (Expo `Record`s), `QwkTlsRequest.perform(options: RequestOptions, promise: Promise)`. Resolves a `Map` `{status: Int, headers: Map<String,String>, bodyBase64: String}`.

- [ ] **Step 1: Write `Records.kt`** (both records here; `DownloadOptions` is consumed in Task 3)

```kotlin
package expo.modules.qwktls

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Arguments of `request` — mirrors NativeRequest in src/native/QwkTls.ts.
 * Fields are `var` — the Expo record converter populates them reflectively. */
class RequestOptions : Record {
  @Field var url: String = ""
  @Field var method: String = "GET"
  @Field var headers: Map<String, String> = emptyMap()
  /** UTF-8 text body (JSON login). Mutually exclusive with bodyBase64. */
  @Field var bodyUtf8: String? = null
  /** Binary body (REP zip), base64. Mutually exclusive with bodyUtf8. */
  @Field var bodyBase64: String? = null
  /** Expected leaf-cert fingerprint: 64 upper-hex chars (pre-normalized by JS). */
  @Field var pinnedSha256: String = ""
}

/** Arguments of `downloadToFile` — mirrors NativeDownloadOptions. */
class DownloadOptions : Record {
  @Field var url: String = ""
  @Field var method: String = "GET"
  @Field var headers: Map<String, String> = emptyMap()
  @Field var pinnedSha256: String = ""
}
```

- [ ] **Step 2: Write `QwkTlsRequest.kt`**

```kotlin
package expo.modules.qwktls

import android.util.Base64
import expo.modules.kotlin.Promise
import java.io.IOException
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * QwkTlsRequest — a pinned HTTPS request with an in-memory body (login JSON /
 * REP upload; both small by design). The JS side (src/api/pinnedFetch.ts)
 * wraps this in a FetchLike.
 */
object QwkTlsRequest {
  fun perform(options: RequestOptions, promise: Promise) {
    val url = options.url.toHttpUrlOrNull()
    if (url == null) {
      promise.reject("QWK_TLS_ARGS", "invalid request options", null)
      return
    }
    val method = options.method.uppercase()
    val bodyBytes = try {
      when {
        options.bodyUtf8 != null -> options.bodyUtf8!!.toByteArray(Charsets.UTF_8)
        options.bodyBase64 != null -> Base64.decode(options.bodyBase64, Base64.DEFAULT)
        else -> null
      }
    } catch (e: IllegalArgumentException) {
      promise.reject("QWK_TLS_ARGS", "invalid base64 body", e)
      return
    }
    // OkHttp requires a body for POST/PUT/PATCH even when JS sent none.
    val body = bodyBytes?.toRequestBody(null)
      ?: if (method == "POST" || method == "PUT" || method == "PATCH") {
        ByteArray(0).toRequestBody(null)
      } else {
        null
      }

    val builder = Request.Builder().url(url).method(method, body)
    for ((name, value) in options.headers) builder.header(name, value)

    pinnedClient(options.pinnedSha256, 30, 30).newCall(builder.build()).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        // Includes TLS failures — a pin mismatch surfaces here, fail closed.
        promise.reject("QWK_TLS_REQUEST", e.message ?: "request failed", e)
      }

      override fun onResponse(call: Call, response: Response) {
        try {
          response.use {
            val bytes = it.body?.bytes() ?: ByteArray(0)
            promise.resolve(
              mapOf(
                "status" to it.code,
                "headers" to headerMap(it.headers),
                "bodyBase64" to Base64.encodeToString(bytes, Base64.NO_WRAP),
              )
            )
          }
        } catch (e: Exception) {
          promise.reject("QWK_TLS_REQUEST", e.message ?: "request failed", e)
        }
      }
    })
  }
}
```

- [ ] **Step 3: Verify no JS regression**

Run: `npx tsc --noEmit && npx jest 2>&1 | tail -3`
Expected: clean / all pass.

- [ ] **Step 4: Commit**

```bash
git add modules/qwk-tls/android
git commit -m "feat(android): pinned in-memory request path"
```

---

### Task 3: Streamed download-to-file + module definition

**Files:**
- Create: `modules/qwk-tls/android/src/main/java/expo/modules/qwktls/QwkTlsDownload.kt`
- Create: `modules/qwk-tls/android/src/main/java/expo/modules/qwktls/QwkTlsModule.kt`

**Interfaces:**
- Consumes: `pinnedClient`, `headerMap` (Task 1); `RequestOptions`, `DownloadOptions`, `QwkTlsRequest.perform`, `QwkTlsProbe.perform` (Tasks 1–2).
- Produces: `QwkTlsDownload.perform(options: DownloadOptions, destPath: String, promise: Promise, onProgress: (Long, Long) -> Unit)`; `QwkTlsModule : Module` exposing `request` / `getFingerprint` / `downloadToFile` and the `onDownloadProgress` event `{id: String, written: Double, total: Double}`.

- [ ] **Step 1: Write `QwkTlsDownload.kt`**

```kotlin
package expo.modules.qwktls

import android.util.Base64
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Request
import okhttp3.Response

/**
 * QwkTlsDownload — a pinned GET streamed straight to a file, so the body never
 * lands in JS memory (or crosses the bridge as base64). The temp file lives
 * next to the destination (`destPath + ".part"`) so the final rename is atomic
 * on one filesystem. On HTTP 200 the part file is moved to destPath; other
 * statuses return the (small) body so JS can surface 204/errors. Byte progress
 * flows through onProgress (→ onDownloadProgress event).
 */
object QwkTlsDownload {
  fun perform(
    options: DownloadOptions,
    destPath: String,
    promise: Promise,
    onProgress: (written: Long, total: Long) -> Unit,
  ) {
    val url = options.url.toHttpUrlOrNull()
    if (url == null || destPath.isBlank()) {
      promise.reject("QWK_TLS_ARGS", "invalid download options", null)
      return
    }
    val builder = Request.Builder().url(url).method(options.method.uppercase(), null)
    for ((name, value) in options.headers) builder.header(name, value)

    pinnedClient(options.pinnedSha256, 30, 120).newCall(builder.build()).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        // Includes TLS failures — a pin mismatch surfaces here, fail closed.
        promise.reject("QWK_TLS_DOWNLOAD", e.message ?: "download failed", e)
      }

      override fun onResponse(call: Call, response: Response) {
        try {
          response.use { handle(it, destPath, promise, onProgress) }
        } catch (e: Exception) {
          promise.reject("QWK_TLS_DOWNLOAD", e.message ?: "download failed", e)
        }
      }
    })
  }

  private fun handle(
    response: Response,
    destPath: String,
    promise: Promise,
    onProgress: (Long, Long) -> Unit,
  ) {
    if (response.code != 200) {
      // 204 / errors: return the small body (if any) so JS maps it the same
      // way as a normal fetch (204 = nothing new, 4xx/5xx = JSON error).
      val bytes = response.body?.bytes() ?: ByteArray(0)
      promise.resolve(
        mapOf(
          "status" to response.code,
          "headers" to headerMap(response.headers),
          "bodyBase64" to Base64.encodeToString(bytes, Base64.NO_WRAP),
        )
      )
      return
    }

    val dest = File(destPath)
    dest.parentFile?.mkdirs()
    val part = File("$destPath.part")
    // A missing Content-Length is -1; normalize to 0 so consumers never see a
    // negative expected size (same as the iOS didWriteData normalization).
    val total = maxOf(0L, response.body?.contentLength() ?: -1L)
    var written = 0L
    try {
      val input = response.body?.byteStream() ?: throw IOException("no response body")
      input.use { source ->
        FileOutputStream(part).use { out ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val n = source.read(buffer)
            if (n < 0) break
            out.write(buffer, 0, n)
            written += n
            onProgress(written, total)
          }
        }
      }
      if (dest.exists() && !dest.delete()) throw IOException("could not replace existing file")
      if (!part.renameTo(dest)) throw IOException("could not move download into place")
    } catch (e: Exception) {
      part.delete() // never leave a partial file behind
      throw e // caller rejects QWK_TLS_DOWNLOAD
    }
    promise.resolve(
      mapOf(
        "status" to 200,
        "headers" to headerMap(response.headers),
        // Double: RN argument conversion does not accept Long.
        "bytesWritten" to written.toDouble(),
      )
    )
  }
}
```

- [ ] **Step 2: Write `QwkTlsModule.kt`**

```kotlin
package expo.modules.qwktls

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * QwkTls — HTTPS requests that pin the server certificate's SHA-256
 * fingerprint. RN's built-in fetch can't validate against a sysop-entered
 * fingerprint, so the QWK API (self-signed by default) is reached through this
 * module. Android counterpart of ios/QwkTlsModule.swift — same JS contract
 * (src/native/QwkTls.ts).
 */
class QwkTlsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("QwkTls")

    AsyncFunction("request") { options: RequestOptions, promise: Promise ->
      QwkTlsRequest.perform(options, promise)
    }

    // Trust-on-first-use: bare TLS handshake, return the leaf cert's SHA-256
    // so the sysop can review + pin it without pasting hex by hand.
    AsyncFunction("getFingerprint") { host: String, port: Int, promise: Promise ->
      QwkTlsProbe.perform(host, port, promise)
    }

    // Real byte progress for streaming downloads (id correlates to the call).
    Events("onDownloadProgress")

    // Stream a pinned GET straight to a file on disk (no in-memory body /
    // base64 bridge blob), so large packets don't blow up memory.
    AsyncFunction("downloadToFile") { options: DownloadOptions, destPath: String, requestId: String, promise: Promise ->
      QwkTlsDownload.perform(options, destPath, promise) { written, total ->
        sendEvent(
          "onDownloadProgress",
          // Doubles: RN argument conversion does not accept Long.
          mapOf("id" to requestId, "written" to written.toDouble(), "total" to total.toDouble())
        )
      }
    }
  }
}
```

- [ ] **Step 3: Verify no JS regression**

Run: `npx tsc --noEmit && npx jest 2>&1 | tail -3`
Expected: clean / all pass.

- [ ] **Step 4: Commit**

```bash
git add modules/qwk-tls/android
git commit -m "feat(android): streamed pinned download and QwkTls module definition"
```

---

### Task 4: Packaging, autolinking config, and the Node consistency test

**Files:**
- Create: `src/native/qwkTlsPackaging.test.ts` (test-first)
- Modify: `modules/qwk-tls/expo-module.config.json`
- Create: `modules/qwk-tls/android/build.gradle`
- Create: `modules/qwk-tls/android/src/main/AndroidManifest.xml`
- Modify: `modules/qwk-tls/index.ts` (comment mentions both platforms)

**Interfaces:**
- Consumes: the Kotlin files from Tasks 1–3 (the test asserts they exist and agree with the config).
- Produces: an autolinkable Android module (`expo.modules.qwktls.QwkTlsModule`).

- [ ] **Step 1: Write the failing packaging test**

```typescript
/**
 * Packaging-consistency guard for the local qwk-tls Expo module: the pieces
 * autolinking relies on (expo-module.config.json ↔ native sources) must agree,
 * for BOTH platforms. Pure file assertions — runs in Node, no native build.
 */
import * as fs from 'fs';
import * as path from 'path';

const MODULE_DIR = path.join(__dirname, '..', '..', 'modules', 'qwk-tls');

function readConfig(): {
  platforms: string[];
  apple: { modules: string[] };
  android: { modules: string[] };
} {
  return JSON.parse(fs.readFileSync(path.join(MODULE_DIR, 'expo-module.config.json'), 'utf8'));
}

describe('qwk-tls module packaging', () => {
  it('declares both platforms for autolinking', () => {
    const config = readConfig();
    expect(config.platforms.sort()).toEqual(['android', 'apple']);
    expect(config.apple.modules).toEqual(['QwkTlsModule']);
    expect(config.android.modules).toEqual(['expo.modules.qwktls.QwkTlsModule']);
  });

  it('has a Kotlin module matching the declared class, named QwkTls', () => {
    const [fqcn] = readConfig().android.modules;
    const parts = fqcn.split('.');
    const className = parts[parts.length - 1];
    const file = path.join(
      MODULE_DIR,
      'android',
      'src',
      'main',
      'java',
      ...parts.slice(0, -1),
      `${className}.kt`
    );
    const source = fs.readFileSync(file, 'utf8');
    expect(source).toContain(`package ${parts.slice(0, -1).join('.')}`);
    expect(source).toContain(`class ${className} : Module()`);
    // The JS side resolves requireNativeModule('QwkTls') on every platform.
    expect(source).toContain('Name("QwkTls")');
    expect(source).toContain('Events("onDownloadProgress")');
  });

  it('gradle config uses the same namespace as the Kotlin package', () => {
    const gradle = fs.readFileSync(path.join(MODULE_DIR, 'android', 'build.gradle'), 'utf8');
    expect(gradle).toContain('namespace "expo.modules.qwktls"');
    expect(gradle).toContain('expo-module-gradle-plugin');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest src/native/qwkTlsPackaging.test.ts 2>&1 | tail -15`
Expected: FAIL — `platforms` is `['apple']`, `config.android` undefined, `build.gradle` missing.

- [ ] **Step 3: Update `modules/qwk-tls/expo-module.config.json`**

```json
{
  "platforms": ["apple", "android"],
  "apple": {
    "modules": ["QwkTlsModule"]
  },
  "android": {
    "modules": ["expo.modules.qwktls.QwkTlsModule"]
  }
}
```

- [ ] **Step 4: Create `modules/qwk-tls/android/build.gradle`** (SDK-57 local-module conventions — same plugins block as e.g. `node_modules/expo-file-system/android/build.gradle`)

```gradle
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'expo.modules.qwktls'
version = '0.1.0'

android {
  namespace "expo.modules.qwktls"
  defaultConfig {
    versionCode 1
    versionName "0.1.0"
  }
}

dependencies {
  // RN already ships OkHttp; declared explicitly so the module states its own
  // needs (gradle resolves to the app's aligned version).
  implementation 'com.squareup.okhttp3:okhttp:4.12.0'
}
```

- [ ] **Step 5: Create `modules/qwk-tls/android/src/main/AndroidManifest.xml`**

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android" />
```

- [ ] **Step 6: Update the `modules/qwk-tls/index.ts` comment**

```typescript
// Native module `QwkTls` (see ios/QwkTlsModule.swift and
// android/src/main/java/expo/modules/qwktls/QwkTlsModule.kt). It is accessed
// through requireNativeModule('QwkTls') in src/native/QwkTls.ts, so this entry
// point is intentionally empty — it exists to autolink the local module during
// prebuild.
export {};
```

- [ ] **Step 7: Run the packaging test — passes; then the full gate**

Run: `npx jest src/native/qwkTlsPackaging.test.ts 2>&1 | tail -5`
Expected: PASS (3 tests).
Run: `npx tsc --noEmit && npx jest 2>&1 | tail -3`
Expected: typecheck clean; full suite green.

- [ ] **Step 8: Commit**

```bash
git add modules/qwk-tls src/native/qwkTlsPackaging.test.ts
git commit -m "feat(android): autolink qwk-tls on Android + packaging-consistency test"
```

---

## Post-plan: PR

Push `feat/qwk-tls-android` and open a PR against `main`. The PR body must:
- Describe the three paths and the parity decisions (DER-SHA-256 pin, fail-closed trust manager, hostname check replaced by pin, `.part`+rename, Double bridge numerics, error codes).
- State honestly what was verified (jest + typecheck; Node packaging test) and what was **not**: Kotlin was not compiled (no Android SDK on this machine) and no on-device run happened. List the pending device checklist from the spec (probe vs `openssl s_client`, pinned round trip, pin-mismatch fail-closed, streamed progress, interrupted-download cleanup).
