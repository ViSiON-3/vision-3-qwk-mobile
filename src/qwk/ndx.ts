/**
 * QWK index files (NNN.NDX, PERSONAL.NDX).
 *
 * Each 5-byte record is a 4-byte Microsoft Binary Format (MBF) single-precision
 * float message pointer + a 1-byte conference number. The pointer, converted to
 * an integer, is the 1-based 128-byte block number of the message's header block
 * within MESSAGES.DAT (block 1 is the producer block; the first real message is
 * block 2 = byte offset 128).
 *
 * NDX files are historically buggy (the MBF choice is widely criticised), so a
 * sequential MESSAGES.DAT scan is the source of truth; NDX is only an
 * optimisation / the "personal" filter.
 */

export const NDX_RECORD_SIZE = 5;

export interface NdxRecord {
  /** 1-based block number of the message header within MESSAGES.DAT. */
  block: number;
  /** Byte offset of the message header within MESSAGES.DAT. */
  byteOffset: number;
  /** Conference number from the record's 5th byte. */
  conference: number;
}

/**
 * Convert a 4-byte MBF single (file order b0 b1 b2 b3) to an integer.
 *
 * b0..b2 = 24-bit mantissa (little-endian), b3 = biased exponent (bias 128).
 * b3 === 0 means 0.0. Implements the proven MultiMail routine with no floating
 * point (values stored are small positive integers).
 */
export function msbinToInt(b0: number, b1: number, b2: number, b3: number): number {
  if (b3 === 0) return 0;
  let mantissa = (b0 | (b1 << 8) | (b2 << 16)) >>> 0;
  mantissa = (mantissa | 0x800000) >>> 0; // restore implied leading 1
  const shift = 152 - b3; // 24 + 128 - exponent
  if (shift < 0 || shift > 31) return 0; // out of sane range
  return mantissa >>> shift;
}

/** Parse an .NDX / PERSONAL.NDX file into records (skips zero pointers). */
export function parseNdx(bytes: Uint8Array): NdxRecord[] {
  const records: NdxRecord[] = [];
  const count = Math.floor(bytes.length / NDX_RECORD_SIZE);
  for (let i = 0; i < count; i++) {
    const off = i * NDX_RECORD_SIZE;
    const block = msbinToInt(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
    if (block <= 0) continue;
    records.push({
      block,
      byteOffset: (block - 1) * 128,
      conference: bytes[off + 4],
    });
  }
  return records;
}
