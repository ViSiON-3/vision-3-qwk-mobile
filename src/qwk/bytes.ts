/**
 * Low-level byte helpers for the fixed-width QWK record format.
 * Uint8Array / DataView only — RN-safe (no Node Buffer).
 */
import { decodeCp437, encodeCp437 } from './cp437';

export const BLOCK_SIZE = 128;

/** Decode a CP437 field, trimming trailing spaces (0x20) and NULs (0x00). */
export function readField(bytes: Uint8Array, offset: number, len: number): string {
  let end = offset + len;
  while (end > offset) {
    const b = bytes[end - 1];
    if (b === 0x20 || b === 0x00) end--;
    else break;
  }
  return decodeCp437(bytes.subarray(offset, end));
}

/** Parse a space-padded ASCII decimal field; returns 0 when blank/non-numeric. */
export function readAsciiInt(bytes: Uint8Array, offset: number, len: number): number {
  const s = readField(bytes, offset, len).trim();
  if (s === '') return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Read an unsigned little-endian 16-bit word. */
export function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/**
 * Write a string into `target` at `offset` as a fixed-width, space-padded,
 * right-truncated CP437 field. Returns the number of bytes written (= len).
 */
export function writeField(target: Uint8Array, offset: number, len: number, value: string): number {
  const encoded = encodeCp437(value);
  for (let i = 0; i < len; i++) {
    target[offset + i] = i < encoded.length ? encoded[i] : 0x20;
  }
  return len;
}

/** Write a left-justified, space-padded ASCII decimal field of width `len`. */
export function writeAsciiInt(target: Uint8Array, offset: number, len: number, value: number): number {
  return writeField(target, offset, len, String(value));
}

/** Write an unsigned little-endian 16-bit word. */
export function writeUint16LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
}

/** Concatenate byte arrays into one Uint8Array. */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
