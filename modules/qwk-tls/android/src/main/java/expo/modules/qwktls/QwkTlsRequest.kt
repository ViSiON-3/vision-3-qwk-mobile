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
    // OkHttp forbids a body on GET/HEAD — reject with the contract's arg code
    // instead of letting Request.Builder.method() throw a generic exception.
    if (bodyBytes != null && (method == "GET" || method == "HEAD")) {
      promise.reject("QWK_TLS_ARGS", "$method request cannot carry a body", null)
      return
    }
    // OkHttp requires a body for POST/PUT/PATCH even when JS sent none.
    val body = bodyBytes?.toRequestBody(null)
      ?: if (method == "POST" || method == "PUT" || method == "PATCH") {
        ByteArray(0).toRequestBody(null)
      } else {
        null
      }

    val request = try {
      val builder = Request.Builder().url(url).method(method, body)
      for ((name, value) in options.headers) builder.header(name, value)
      builder.build()
    } catch (e: IllegalArgumentException) {
      // Invalid method token or header characters — an argument problem, not a
      // transport failure, so keep the contract's arg code.
      promise.reject("QWK_TLS_ARGS", e.message ?: "invalid request options", e)
      return
    }

    pinnedClient(options.pinnedSha256, 30, 30).newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        // Includes TLS failures — a pin mismatch surfaces here, fail closed.
        promise.reject("QWK_TLS_REQUEST", e.message ?: "request failed", e)
      }

      override fun onResponse(call: Call, response: Response) {
        // Build the result inside use{} but settle only after the response is
        // closed, so a throwing close() can never double-settle the promise.
        val result = try {
          response.use {
            val bytes = it.body?.bytes() ?: ByteArray(0)
            mapOf(
              "status" to it.code,
              "headers" to headerMap(it.headers),
              "bodyBase64" to Base64.encodeToString(bytes, Base64.NO_WRAP),
            )
          }
        } catch (e: Exception) {
          promise.reject("QWK_TLS_REQUEST", e.message ?: "request failed", e)
          return
        }
        promise.resolve(result)
      }
    })
  }
}
