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
