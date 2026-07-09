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
