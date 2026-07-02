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
  }
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

    let der = SecCertificateCopyData(certificate) as Data
    let hex = SHA256.hash(data: der).map { String(format: "%02X", $0) }.joined()

    if hex == pinnedSha256 {
      completionHandler(.useCredential, URLCredential(trust: trust))
    } else {
      completionHandler(.cancelAuthenticationChallenge, nil)
    }
  }
}
