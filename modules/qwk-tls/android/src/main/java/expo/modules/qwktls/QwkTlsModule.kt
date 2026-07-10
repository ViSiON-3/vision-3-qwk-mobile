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
