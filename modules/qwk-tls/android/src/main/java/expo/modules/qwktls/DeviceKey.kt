package expo.modules.qwktls

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import androidx.annotation.RequiresApi
import expo.modules.kotlin.Promise
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

private const val ANDROID_KEYSTORE = "AndroidKeyStore"
private val ALIAS_PATTERN = Regex("^[A-Za-z0-9._-]+$")

/**
 * DeviceKey — per-alias hardware-backed P-256 ECDSA device key, used by the
 * device-pairing login (the server keeps the public key; the app proves
 * possession by signing a challenge). The private key lives in the Android
 * Keystore (StrongBox when available, else TEE; `hardwareBacked` reports
 * whether it is inside secure hardware) and never crosses the bridge.
 * iOS counterpart: ios/QwkDeviceKey.swift — same JS contract (src/native/QwkTls.ts).
 */
object DeviceKey {
  fun generate(alias: String, promise: Promise) {
    if (!isValidAlias(alias)) {
      promise.reject("QWK_KEY_ARGS", "invalid alias", null)
      return
    }
    val keyStore = try {
      loadKeyStore()
    } catch (e: Exception) {
      promise.reject("QWK_KEY_GENERATE", e.message ?: "keystore unavailable", e)
      return
    }
    try {
      // Replace any existing key: a stale pairing's key must not survive.
      if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
      generateKeyPair(alias)

      val publicKeyDer = keyStore.getCertificate(alias)?.publicKey?.encoded
      if (publicKeyDer == null) {
        runCatching { keyStore.deleteEntry(alias) }
        promise.reject("QWK_KEY_GENERATE", "could not export public key", null)
        return
      }
      val privateKey = keyStore.getKey(alias, null) as? PrivateKey
      promise.resolve(
        mapOf(
          // X.509 certificate public key `encoded` is already SPKI DER.
          "publicKey" to Base64.encodeToString(publicKeyDer, Base64.NO_WRAP),
          "algorithm" to "P-256",
          "hardwareBacked" to (privateKey?.let { isHardwareBacked(it) } ?: false)
        )
      )
    } catch (e: Exception) {
      runCatching { keyStore.deleteEntry(alias) }
      promise.reject("QWK_KEY_GENERATE", e.message ?: "key generation failed", e)
    }
  }

  fun sign(alias: String, messageBase64: String, promise: Promise) {
    if (!isValidAlias(alias)) {
      promise.reject("QWK_KEY_ARGS", "invalid alias", null)
      return
    }
    val message = try {
      Base64.decode(messageBase64, Base64.DEFAULT)
    } catch (e: IllegalArgumentException) {
      promise.reject("QWK_KEY_ARGS", "message is not valid base64", e)
      return
    }
    val privateKey = try {
      loadKeyStore().getKey(alias, null) as? PrivateKey
    } catch (e: Exception) {
      promise.reject("QWK_KEY_SIGN", e.message ?: "keystore unavailable", e)
      return
    }
    if (privateKey == null) {
      promise.reject("QWK_KEY_MISSING", "no device key for alias", null)
      return
    }
    try {
      // SHA256withECDSA output is the ASN.1 DER SEQUENCE { r INTEGER, s INTEGER }.
      val signature = Signature.getInstance("SHA256withECDSA").run {
        initSign(privateKey)
        update(message)
        sign()
      }
      promise.resolve(Base64.encodeToString(signature, Base64.NO_WRAP))
    } catch (e: Exception) {
      promise.reject("QWK_KEY_SIGN", e.message ?: "signing failed", e)
    }
  }

  fun has(alias: String, promise: Promise) {
    if (!isValidAlias(alias)) {
      promise.reject("QWK_KEY_ARGS", "invalid alias", null)
      return
    }
    try {
      val keyStore = loadKeyStore()
      promise.resolve(keyStore.containsAlias(alias) && keyStore.getKey(alias, null) is PrivateKey)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  fun delete(alias: String, promise: Promise) {
    if (!isValidAlias(alias)) {
      promise.reject("QWK_KEY_ARGS", "invalid alias", null)
      return
    }
    try {
      val keyStore = loadKeyStore()
      // No-op when absent.
      if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
      promise.resolve()
    } catch (e: Exception) {
      promise.reject("QWK_KEY_GENERATE", e.message ?: "could not delete key", e)
    }
  }

  // --- helpers ---------------------------------------------------------------

  private fun isValidAlias(alias: String): Boolean = ALIAS_PATTERN.matches(alias)

  private fun loadKeyStore(): KeyStore =
    KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

  /** Generates a persistent secp256r1 signing key under [alias]. On API 28+
   * StrongBox is tried first and the TEE is used when it is unavailable. */
  private fun generateKeyPair(alias: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && tryGenerateStrongBoxKeyPair(alias)) {
      return
    }
    generateWithSpec(baseSpec(alias).build())
  }

  /** Returns false (and generates nothing) when the device has no StrongBox,
   * so the caller falls back to the regular (TEE) keystore. Kept in its own
   * method so the API-28 StrongBox symbols are only resolved on P+. */
  @RequiresApi(Build.VERSION_CODES.P)
  private fun tryGenerateStrongBoxKeyPair(alias: String): Boolean {
    return try {
      generateWithSpec(baseSpec(alias).setIsStrongBoxBacked(true).build())
      true
    } catch (e: StrongBoxUnavailableException) {
      false
    }
  }

  private fun baseSpec(alias: String): KeyGenParameterSpec.Builder =
    KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
      .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      .setDigests(KeyProperties.DIGEST_SHA256)

  private fun generateWithSpec(spec: KeyGenParameterSpec) {
    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE).run {
      initialize(spec)
      generateKeyPair()
    }
  }

  /** True when the Keystore reports the private key inside secure hardware
   * (TEE or StrongBox). Any failure to introspect the key reports false. */
  private fun isHardwareBacked(privateKey: PrivateKey): Boolean {
    return try {
      val keyInfo = KeyFactory.getInstance(privateKey.algorithm, ANDROID_KEYSTORE)
        .getKeySpec(privateKey, KeyInfo::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        securityLevelIsHardware(keyInfo)
      } else {
        @Suppress("DEPRECATION")
        keyInfo.isInsideSecureHardware
      }
    } catch (e: Exception) {
      false
    }
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private fun securityLevelIsHardware(keyInfo: KeyInfo): Boolean =
    keyInfo.securityLevel >= KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT
}
