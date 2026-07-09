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
