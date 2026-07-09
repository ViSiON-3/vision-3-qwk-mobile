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
        // Build the result inside use{} but settle only after the response is
        // closed, so a throwing close() can never double-settle the promise.
        val result = try {
          response.use { handle(it, destPath, onProgress) }
        } catch (e: Exception) {
          promise.reject("QWK_TLS_DOWNLOAD", e.message ?: "download failed", e)
          return
        }
        promise.resolve(result)
      }
    })
  }

  private fun handle(
    response: Response,
    destPath: String,
    onProgress: (Long, Long) -> Unit,
  ): Map<String, Any> {
    if (response.code != 200) {
      // 204 / errors: return the small body (if any) so JS maps it the same
      // way as a normal fetch (204 = nothing new, 4xx/5xx = JSON error).
      val bytes = response.body?.bytes() ?: ByteArray(0)
      return mapOf(
        "status" to response.code,
        "headers" to headerMap(response.headers),
        "bodyBase64" to Base64.encodeToString(bytes, Base64.NO_WRAP),
      )
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
    return mapOf(
      "status" to 200,
      "headers" to headerMap(response.headers),
      // Double: RN argument conversion does not accept Long.
      "bytesWritten" to written.toDouble(),
    )
  }
}
