/** Parse the canvas dimensions of a WebP asset from its header bytes.
 *
 * Supports the three WebP container formats:
 * - VP8X (extended): canvas width/height at byte offsets 24 and 27
 * - VP8L (lossless): 14-bit width-1/height-1 after the signature byte at 20
 * - VP8 (lossy): 14-bit width/height in the frame tag at byte offset 26
 *
 * A non-WebP payload or a truncated header throws so the loader fails closed
 * instead of emitting an asset with unknown dimensions.
 */
export function parseWebpDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 12) throw new Error('WebP payload is truncated');
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'RIFF') {
    throw new Error('missing RIFF header');
  }
  if (String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) !== 'WEBP') {
    throw new Error('missing WEBP header');
  }
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (bytes.length < 16) throw new Error('WebP payload is truncated');

  if (chunk === 'VP8X') {
    if (bytes.length < 30) throw new Error('VP8X header is truncated');
    const width = 1 + readUint24LE(bytes, 24);
    const height = 1 + readUint24LE(bytes, 27);
    return { width, height };
  }
  if (chunk === 'VP8L') {
    if (bytes.length < 25 || bytes[20] !== 0x2f) throw new Error('VP8L header is invalid');
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') {
    if (bytes.length < 30) throw new Error('VP8 header is truncated');
    const frame = bytes[26] | (bytes[27] << 8) | (bytes[28] << 16) | (bytes[29] << 24);
    return { width: frame & 0x3fff, height: (frame >> 14) & 0x3fff };
  }
  throw new Error(`unsupported WebP chunk '${chunk}'`);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}
