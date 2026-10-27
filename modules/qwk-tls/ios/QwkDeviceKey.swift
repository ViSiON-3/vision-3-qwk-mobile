import ExpoModulesCore
import Foundation
import Security

/**
 * QwkDeviceKey — per-alias hardware-backed P-256 ECDSA device key, used by the
 * device-pairing login (the server keeps the public key; the app proves
 * possession by signing a challenge). The private key lives in the Secure
 * Enclave when available (software keychain key on simulators / unsupported
 * hardware, reported via `hardwareBacked: false`) and never crosses the bridge.
 * Android counterpart: DeviceKey.kt — same JS contract (src/native/QwkTls.ts).
 */
enum QwkDeviceKey {
  /// DER SubjectPublicKeyInfo prefix for an uncompressed P-256 point:
  /// SEQUENCE { SEQUENCE { OID id-ecPublicKey, OID prime256v1 }, BIT STRING (65 bytes, 0 unused) }.
  private static let p256SpkiHeader: [UInt8] = [
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01,
    0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
  ]

  // MARK: - Entry points (one per AsyncFunction)

  static func generate(alias: String, promise: Promise) {
    guard let tag = tagData(alias) else {
      promise.reject("QWK_KEY_ARGS", "invalid alias")
      return
    }
    // Replace any existing key: a stale pairing's key must not survive.
    let deleteStatus = deleteAll(tag: tag)
    guard deleteStatus == errSecSuccess || deleteStatus == errSecItemNotFound else {
      promise.reject("QWK_KEY_GENERATE", "could not remove existing key (\(deleteStatus))")
      return
    }

    var hardwareBacked = true
    var privateKey: SecKey?
    var lastError: String?
    switch createKey(tag: tag, secureEnclave: true) {
    case .success(let key):
      privateKey = key
    case .failure(let message):
      // Simulator / no Secure Enclave: fall back to a software keychain key.
      lastError = message
      hardwareBacked = false
      switch createKey(tag: tag, secureEnclave: false) {
      case .success(let key): privateKey = key
      case .failure(let fallbackMessage): lastError = fallbackMessage
      }
    }
    guard let key = privateKey else {
      promise.reject("QWK_KEY_GENERATE", lastError ?? "key generation failed")
      return
    }

    guard let spki = publicKeySpki(key) else {
      // Don't leave an unusable key behind.
      _ = deleteAll(tag: tag)
      promise.reject("QWK_KEY_GENERATE", "could not export public key")
      return
    }
    promise.resolve([
      "publicKey": spki.base64EncodedString(),
      "algorithm": "P-256",
      "hardwareBacked": hardwareBacked,
    ])
  }

  static func sign(alias: String, messageBase64: String, promise: Promise) {
    guard let tag = tagData(alias) else {
      promise.reject("QWK_KEY_ARGS", "invalid alias")
      return
    }
    guard let message = Data(base64Encoded: messageBase64) else {
      promise.reject("QWK_KEY_ARGS", "message is not valid base64")
      return
    }
    guard let key = lookup(tag: tag) else {
      promise.reject("QWK_KEY_MISSING", "no device key for alias")
      return
    }
    let algorithm: SecKeyAlgorithm = .ecdsaSignatureMessageX962SHA256
    guard SecKeyIsAlgorithmSupported(key, .sign, algorithm) else {
      promise.reject("QWK_KEY_SIGN", "ECDSA-SHA256 not supported by key")
      return
    }
    var error: Unmanaged<CFError>?
    guard let signature = SecKeyCreateSignature(key, algorithm, message as CFData, &error) as Data? else {
      promise.reject("QWK_KEY_SIGN", describe(error, fallback: "signing failed"))
      return
    }
    // X9.62 output is already the ASN.1 DER SEQUENCE { r INTEGER, s INTEGER }.
    promise.resolve(signature.base64EncodedString())
  }

  static func has(alias: String, promise: Promise) {
    guard let tag = tagData(alias) else {
      promise.reject("QWK_KEY_ARGS", "invalid alias")
      return
    }
    promise.resolve(lookup(tag: tag) != nil)
  }

  static func delete(alias: String, promise: Promise) {
    guard let tag = tagData(alias) else {
      promise.reject("QWK_KEY_ARGS", "invalid alias")
      return
    }
    let status = deleteAll(tag: tag)
    if status == errSecSuccess || status == errSecItemNotFound {
      promise.resolve()
    } else {
      promise.reject("QWK_KEY_GENERATE", "could not delete key (\(status))")
    }
  }

  // MARK: - Keychain helpers

  /// Aliases are `[A-Za-z0-9._-]+`; the UTF-8 bytes become the keychain
  /// application tag the key is found/deleted by.
  private static func tagData(_ alias: String) -> Data? {
    guard !alias.isEmpty,
      alias.unicodeScalars.allSatisfy({ scalar in
        (scalar >= "A" && scalar <= "Z") || (scalar >= "a" && scalar <= "z")
          || (scalar >= "0" && scalar <= "9") || scalar == "." || scalar == "_" || scalar == "-"
      })
    else { return nil }
    return alias.data(using: .utf8)
  }

  private enum CreateResult {
    case success(SecKey)
    case failure(String)
  }

  private static func createKey(tag: Data, secureEnclave: Bool) -> CreateResult {
    var privateAttrs: [String: Any] = [
      kSecAttrIsPermanent as String: true,
      kSecAttrApplicationTag as String: tag,
    ]
    var attrs: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeySizeInBits as String: 256,
    ]
    if secureEnclave {
      var acError: Unmanaged<CFError>?
      guard
        let access = SecAccessControlCreateWithFlags(
          nil,
          kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
          .privateKeyUsage,
          &acError
        )
      else {
        return .failure(describe(acError, fallback: "access control creation failed"))
      }
      privateAttrs[kSecAttrAccessControl as String] = access
      attrs[kSecAttrTokenID as String] = kSecAttrTokenIDSecureEnclave
    } else {
      // Software key: same lifetime policy, minus the token/usage flags the
      // Secure Enclave requires.
      privateAttrs[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    }
    attrs[kSecPrivateKeyAttrs as String] = privateAttrs

    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateRandomKey(attrs as CFDictionary, &error) else {
      return .failure(describe(error, fallback: "SecKeyCreateRandomKey failed"))
    }
    return .success(key)
  }

  private static func baseQuery(tag: Data) -> [String: Any] {
    [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: tag,
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
    ]
  }

  private static func lookup(tag: Data) -> SecKey? {
    var query = baseQuery(tag: tag)
    query[kSecReturnRef as String] = true
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let ref = item else { return nil }
    // CFTypeRef → SecKey: verify the type id rather than force-casting.
    guard CFGetTypeID(ref) == SecKeyGetTypeID() else { return nil }
    return (ref as! SecKey)
  }

  /// Removes every key stored under the tag (Secure Enclave or software).
  /// Returns errSecSuccess / errSecItemNotFound on a clean outcome.
  private static func deleteAll(tag: Data) -> OSStatus {
    // Drop the key-class filter so a stray public key under the same tag is
    // removed too; SecItemDelete removes all matching items on iOS.
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: tag,
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
    ]
    return SecItemDelete(query as CFDictionary)
  }

  /// Base64-ready DER SubjectPublicKeyInfo: fixed P-256 header + the 65-byte
  /// uncompressed X9.63 point from Security.framework. Nil if the raw
  /// representation isn't the expected 04 || X || Y.
  private static func publicKeySpki(_ privateKey: SecKey) -> Data? {
    guard let publicKey = SecKeyCopyPublicKey(privateKey) else { return nil }
    var error: Unmanaged<CFError>?
    guard let raw = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else { return nil }
    guard raw.count == 65, raw.first == 0x04 else { return nil }
    var spki = Data(p256SpkiHeader)
    spki.append(raw)
    return spki
  }

  private static func describe(_ error: Unmanaged<CFError>?, fallback: String) -> String {
    guard let cfError = error?.takeRetainedValue() else { return fallback }
    return (cfError as Error).localizedDescription
  }
}
