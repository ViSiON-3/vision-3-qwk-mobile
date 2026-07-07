import ExpoModulesCore
import Foundation
import CryptoKit

/**
 * QwkTls — HTTPS requests that pin the server certificate's SHA-256 fingerprint.
 *
 * RN's built-in fetch can't validate against a sysop-entered fingerprint, so the
 * QWK API (self-signed by default) is reached through this module. The JS side
 * (src/api/pinnedFetch.ts) wraps `request` in a FetchLike.
 */
public class QwkTlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("QwkTls")

    AsyncFunction("request") { (options: [String: Any], promise: Promise) in
      QwkTlsRequest.perform(options: options, promise: promise)
    }

    // Trust-on-first-use: open an unpinned handshake and return the leaf cert's
    // SHA-256 so the sysop can review + pin it without pasting hex by hand.
    AsyncFunction("getFingerprint") { (host: String, port: Int, promise: Promise) in
      QwkTlsProbe.perform(host: host, port: port, promise: promise)
    }
  }
}

/** Upper-hex SHA-256 of the leaf certificate in a server-trust chain — the same
 * value the pinning check compares against, so a captured fingerprint matches
 * on later pinned connections. */
func leafSha256Hex(_ trust: SecTrust) -> String? {
  let leaf: SecCertificate?
  if #available(iOS 15.0, *) {
    leaf = (SecTrustCopyCertificateChain(trust) as? [SecCertificate])?.first
  } else {
    leaf = SecTrustGetCertificateAtIndex(trust, 0)
  }
  guard let certificate = leaf else { return nil }
  let der = SecCertificateCopyData(certificate) as Data
  return SHA256.hash(data: der).map { String(format: "%02X", $0) }.joined()
}

private final class QwkTlsRequest: NSObject, URLSessionDelegate {
  private let pinnedSha256: String
  private let promise: Promise
  private var session: URLSession?

  private init(pinnedSha256: String, promise: Promise) {
    self.pinnedSha256 = pinnedSha256.uppercased().filter { $0.isHexDigit }
    self.promise = promise
    super.init()
  }

  static func perform(options: [String: Any], promise: Promise) {
    guard
      let urlString = options["url"] as? String,
      let url = URL(string: urlString),
      let pinned = options["pinnedSha256"] as? String
    else {
      promise.reject("QWK_TLS_ARGS", "invalid request options")
      return
    }
    QwkTlsRequest(pinnedSha256: pinned, promise: promise).start(url: url, options: options)
  }

  private func start(url: URL, options: [String: Any]) {
    var request = URLRequest(url: url)
    request.httpMethod = (options["method"] as? String) ?? "GET"
    request.timeoutInterval = 30

    if let headers = options["headers"] as? [String: Any] {
      for (key, value) in headers { request.setValue("\(value)", forHTTPHeaderField: key) }
    }
    if let bodyUtf8 = options["bodyUtf8"] as? String {
      request.httpBody = bodyUtf8.data(using: .utf8)
    } else if let bodyB64 = options["bodyBase64"] as? String, let data = Data(base64Encoded: bodyB64) {
      request.httpBody = data
    }

    let session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: nil)
    self.session = session
    let task = session.dataTask(with: request) { [weak self] data, response, error in
      guard let self = self else { return }
      defer { self.session?.finishTasksAndInvalidate() }

      if let error = error {
        self.promise.reject("QWK_TLS_REQUEST", error.localizedDescription)
        return
      }
      guard let http = response as? HTTPURLResponse else {
        self.promise.reject("QWK_TLS_RESPONSE", "no HTTP response")
        return
      }
      var headers: [String: String] = [:]
      for (key, value) in http.allHeaderFields {
        if let k = key as? String { headers[k] = "\(value)" }
      }
      self.promise.resolve([
        "status": http.statusCode,
        "headers": headers,
        "bodyBase64": (data ?? Data()).base64EncodedString(),
      ])
    }
    task.resume()
  }

  // Server-trust challenge: accept only if the leaf cert's SHA-256 matches the pin.
  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard
      challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      let trust = challenge.protectionSpace.serverTrust
    else {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    let leaf: SecCertificate?
    if #available(iOS 15.0, *) {
      leaf = (SecTrustCopyCertificateChain(trust) as? [SecCertificate])?.first
    } else {
      leaf = SecTrustGetCertificateAtIndex(trust, 0)
    }
    guard let certificate = leaf else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }

    // Fail closed on a malformed pin (empty / not a 64-hex SHA-256) rather than
    // relying on a hash mismatch — defense-in-depth alongside the JS validation.
    guard pinnedSha256.count == 64, let hex = leafSha256Hex(trust) else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }

    if hex == pinnedSha256 {
      completionHandler(.useCredential, URLCredential(trust: trust))
    } else {
      completionHandler(.cancelAuthenticationChallenge, nil)
    }
  }
}

/**
 * QwkTlsProbe — one-shot trust-on-first-use fingerprint capture. Opens an
 * unpinned TLS handshake to the host, reads the presented leaf cert's SHA-256,
 * and resolves it without trusting the connection for any actual request (the
 * challenge is cancelled once the cert is read). The sysop reviews + pins it.
 */
private final class QwkTlsProbe: NSObject, URLSessionDelegate {
  private let promise: Promise
  private var session: URLSession?
  private var settled = false

  private init(promise: Promise) {
    self.promise = promise
    super.init()
  }

  static func perform(host: String, port: Int, promise: Promise) {
    guard port > 0, port <= 65535, let url = URL(string: "https://\(host):\(port)/") else {
      promise.reject("QWK_TLS_ARGS", "invalid host/port")
      return
    }
    QwkTlsProbe(promise: promise).start(url: url)
  }

  private func settle(_ fingerprint: String) {
    if settled { return }
    settled = true
    promise.resolve(fingerprint)
    session?.finishTasksAndInvalidate()
  }

  private func fail(_ message: String) {
    if settled { return }
    settled = true
    promise.reject("QWK_TLS_PROBE", message)
    session?.finishTasksAndInvalidate()
  }

  private func start(url: URL) {
    var request = URLRequest(url: url)
    request.httpMethod = "HEAD"
    request.timeoutInterval = 15
    let session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: nil)
    self.session = session
    session.dataTask(with: request) { [weak self] _, _, error in
      // Reached only if no cert was captured (e.g. connection refused / non-TLS).
      self?.fail(error?.localizedDescription ?? "no certificate presented")
    }.resume()
  }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard
      challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      let trust = challenge.protectionSpace.serverTrust
    else {
      // Not a server-trust challenge (won't happen for the probe); let the
      // system handle it rather than trusting anything ourselves.
      completionHandler(.performDefaultHandling, nil)
      return
    }
    guard let hex = leafSha256Hex(trust) else {
      // Server-trust challenge but no readable cert — fail, never trust it.
      fail("no certificate presented")
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }
    // Capture the fingerprint (TOFU) and settle BEFORE cancelling, so the task
    // completion the cancellation triggers sees `settled` and no-ops (no race).
    // The connection itself is never trusted.
    settle(hex)
    completionHandler(.cancelAuthenticationChallenge, nil)
  }
}
