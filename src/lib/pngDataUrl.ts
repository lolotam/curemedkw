// Curemed — the structural PNG check of one pairing QR in the browser.
//
// Canonical base64 is not enough: non-PNG bytes or a PNG cut short decode
// cleanly and would be shown as a broken pairing code. A payload is shown
// only when it is one complete, CRC-valid PNG stream (signature, a 13-byte
// IHDR with a non-zero size, at least one IDAT, a final empty IEND ending
// exactly at the last byte).
//
// This mirrors supabase/functions/_shared/evolution-pairing-png.ts. The
// Edge bundle cannot import application code, so the two stay in step
// through the same fixtures in both test suites.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHUNK_OVERHEAD = 12;
const IHDR_LENGTH = 13;

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function isChunkTypeByte(byte: number): boolean {
  return (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);
}

function chunkType(bytes: Uint8Array, offset: number): string | null {
  for (let i = offset; i < offset + 4; i++) {
    if (!isChunkTypeByte(bytes[i])) return null;
  }
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

/** True when the bytes are one complete, CRC-valid PNG stream. */
export function isCompletePng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length + 3 * CHUNK_OVERHEAD + IHDR_LENGTH) {
    return false;
  }
  if (PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    return false;
  }

  let offset = PNG_SIGNATURE.length;
  let first = true;
  let sawImageData = false;
  while (offset + CHUNK_OVERHEAD <= bytes.length) {
    const length = readUint32(bytes, offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (length > bytes.length || dataEnd + 4 > bytes.length) return false;
    const type = chunkType(bytes, offset + 4);
    if (type === null) return false;
    if (crc32(bytes, offset + 4, dataEnd) !== readUint32(bytes, dataEnd)) {
      return false;
    }
    if (first) {
      if (type !== "IHDR" || length !== IHDR_LENGTH) return false;
      if (readUint32(bytes, dataStart) === 0) return false;
      if (readUint32(bytes, dataStart + 4) === 0) return false;
      first = false;
    } else if (type === "IHDR") {
      return false;
    }
    if (type === "IDAT") sawImageData = true;
    offset = dataEnd + 4;
    if (type === "IEND") {
      return length === 0 && sawImageData && offset === bytes.length;
    }
  }
  return false;
}

/**
 * True for canonical standard base64 whose bytes are one complete PNG.
 * The caller bounds the length before this runs.
 */
export function isCanonicalPngBase64(value: string): boolean {
  if (value.length === 0) return false;
  let binary: string;
  try {
    binary = atob(value);
    if (btoa(binary) !== value) return false;
  } catch {
    return false;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return isCompletePng(bytes);
}
