import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

export const TILE_SIDE = 64;
export const TILE_BYTES = TILE_SIDE * TILE_SIDE;
export const PINNED_PAIR_WIDTH = TILE_SIDE * 2;
export const PINNED_PAIR_HEIGHT = TILE_SIDE;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from(type, (character) => character.charCodeAt(0));
  const out = new Uint8Array(12 + data.byteLength);
  writeUint32(out, 0, data.byteLength);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.byteLength);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  writeUint32(out, 8 + data.byteLength, crc32(crcInput));
  return out;
}

function requireGrayscaleTile(tile: Uint8Array, label: string): void {
  if (!(tile instanceof Uint8Array)) {
    throw new TypeError(`${label} must be a Uint8Array`);
  }
  if (tile.byteLength !== TILE_BYTES) {
    throw new Error(`${label} must be exactly ${TILE_BYTES} bytes (64x64 8-bit grayscale)`);
  }
}

function requireMatchingSha256(label: string, declared: string, tile: Uint8Array): void {
  if (typeof declared !== 'string' || !SHA256_PATTERN.test(declared)) {
    throw new Error(`${label} SHA-256 must be 64 lowercase hexadecimal characters`);
  }
  const actual = createHash('sha256').update(tile).digest('hex');
  if (actual !== declared) {
    throw new Error(`${label} SHA-256 does not match the supplied bytes`);
  }
}

function readUint32(source: Uint8Array, offset: number): number {
  return new DataView(source.buffer, source.byteOffset + offset, 4).getUint32(0);
}

function pngError(message: string): never {
  throw new Error(`unsupported pinned glyph PNG: ${message}`);
}

function assertPngSignature(pngBytes: Uint8Array): void {
  if (!(pngBytes instanceof Uint8Array)) {
    throw new TypeError('pinned glyph PNG must be a Uint8Array');
  }
  if (pngBytes.byteLength < PNG_SIGNATURE.byteLength) pngError('truncated signature');
  for (let index = 0; index < PNG_SIGNATURE.byteLength; index += 1) {
    if (pngBytes[index] !== PNG_SIGNATURE[index]) pngError('invalid signature');
  }
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function unfilterPngRows(raw: Uint8Array, channels: number): Uint8Array {
  const rowBytes = TILE_SIDE * channels;
  const expectedLength = TILE_SIDE * (rowBytes + 1);
  if (raw.byteLength !== expectedLength) pngError('inflated scanline length does not match a 64x64 tile');

  const pixels = new Uint8Array(TILE_SIDE * rowBytes);
  for (let row = 0; row < TILE_SIDE; row += 1) {
    const rawOffset = row * (rowBytes + 1);
    const filter = raw[rawOffset];
    if (filter > 4) pngError(`unsupported PNG filter ${filter}`);
    const rowOffset = row * rowBytes;
    const previousRowOffset = rowOffset - rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const encoded = raw[rawOffset + 1 + column];
      const left = column >= channels ? pixels[rowOffset + column - channels] : 0;
      const above = row > 0 ? pixels[previousRowOffset + column] : 0;
      const upperLeft = row > 0 && column >= channels ? pixels[previousRowOffset + column - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paethPredictor(left, above, upperLeft);
      pixels[rowOffset + column] = (encoded + predictor) & 0xff;
    }
  }
  return pixels;
}

/**
 * Decode a pinned historical glyph PNG into the exact #262 64x64 grayscale
 * derivative. This is byte validation and color conversion only; it performs
 * no glyph identification, metadata projection, or visual inference.
 */
export function decodePinnedGlyphPng(pngBytes: Uint8Array, expectedDerivativeSha256: string): Uint8Array {
  if (typeof expectedDerivativeSha256 !== 'string' || !SHA256_PATTERN.test(expectedDerivativeSha256)) {
    throw new Error('expected derivative SHA-256 must be 64 lowercase hexadecimal characters');
  }
  assertPngSignature(pngBytes);

  let offset = PNG_SIGNATURE.byteLength;
  let colorType: number | undefined;
  let channels: number | undefined;
  let sawIhdr = false;
  let sawIdat = false;
  let sawIend = false;
  const idatParts: Uint8Array[] = [];

  while (offset < pngBytes.byteLength) {
    if (pngBytes.byteLength - offset < 12) pngError('truncated chunk');
    const length = readUint32(pngBytes, offset);
    const totalLength = 12 + length;
    if (totalLength > pngBytes.byteLength - offset) pngError('truncated chunk data');

    const typeBytes = pngBytes.subarray(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    const data = pngBytes.subarray(offset + 8, offset + 8 + length);
    const declaredCrc = readUint32(pngBytes, offset + 8 + length);
    const crcInput = pngBytes.subarray(offset + 4, offset + 8 + length);
    if (crc32(crcInput) !== declaredCrc) pngError(`CRC mismatch in ${type}`);

    if (!sawIhdr) {
      if (type !== 'IHDR' || length !== 13) pngError('IHDR must be the first 13-byte chunk');
      const width = readUint32(data, 0);
      const height = readUint32(data, 4);
      const bitDepth = data[8];
      colorType = data[9];
      if (width !== TILE_SIDE || height !== TILE_SIDE) pngError('dimensions must be exactly 64x64');
      if (bitDepth !== 8) pngError('bit depth must be 8');
      if (colorType !== 0 && colorType !== 2 && colorType !== 6) pngError(`unsupported color type ${colorType}`);
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) pngError('compression, filter, and interlace methods must all be 0');
      channels = colorType === 0 ? 1 : colorType === 2 ? 3 : 4;
      sawIhdr = true;
    } else if (type === 'IDAT') {
      if (sawIend) pngError('IDAT appears after IEND');
      sawIdat = true;
      idatParts.push(Uint8Array.from(data));
    } else if (type === 'IEND') {
      if (!sawIdat || length !== 0) pngError('IEND must follow one or more IDAT chunks and be empty');
      sawIend = true;
      offset += totalLength;
      if (offset !== pngBytes.byteLength) pngError('trailing data after IEND');
      break;
    } else {
      pngError(`unsupported PNG chunk ${type}`);
    }
    offset += totalLength;
  }

  if (!sawIhdr || !sawIdat || !sawIend) pngError('IHDR, IDAT, and IEND are all required');
  const compressedLength = idatParts.reduce((total, part) => total + part.byteLength, 0);
  const compressed = new Uint8Array(compressedLength);
  let compressedOffset = 0;
  for (const part of idatParts) {
    compressed.set(part, compressedOffset);
    compressedOffset += part.byteLength;
  }

  const expectedRawLength = TILE_SIDE * (TILE_SIDE * channels! + 1);
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(inflateSync(compressed, { maxOutputLength: expectedRawLength }));
  } catch {
    pngError('invalid zlib stream or inflated scanline length');
  }
  const pixels = unfilterPngRows(raw, channels!);
  const grayscale = new Uint8Array(TILE_BYTES);
  if (colorType === 0) {
    grayscale.set(pixels);
  } else {
    for (let index = 0; index < TILE_BYTES; index += 1) {
      const sourceOffset = index * channels!;
      if (colorType === 6 && pixels[sourceOffset + 3] !== 255) pngError('transparent RGBA pixels are unsupported');
      grayscale[index] = Math.floor((299 * pixels[sourceOffset] + 587 * pixels[sourceOffset + 1] + 114 * pixels[sourceOffset + 2] + 500) / 1000);
    }
  }
  requireMatchingSha256('decoded pinned glyph tile', expectedDerivativeSha256, grayscale);
  return grayscale;
}

/**
 * Render a metadata-free 128x64 pinned pair PNG.
 *
 * Inputs are the exact 64x64 8-bit grayscale derivatives; they are laid out
 * horizontally at unchanged scale (left then right) and encoded as a
 * non-interlaced grayscale (color type 0, bit depth 8) PNG. The output carries
 * no textual metadata and performs no perceptual or glyph analysis.
 */
export function renderPinnedPair(
  left: Uint8Array,
  right: Uint8Array,
  leftSha256: string,
  rightSha256: string,
): Uint8Array {
  requireGrayscaleTile(left, 'left tile');
  requireGrayscaleTile(right, 'right tile');
  requireMatchingSha256('left tile', leftSha256, left);
  requireMatchingSha256('right tile', rightSha256, right);

  const rowBytes = PINNED_PAIR_WIDTH + 1;
  const raw = new Uint8Array(rowBytes * PINNED_PAIR_HEIGHT);
  for (let row = 0; row < PINNED_PAIR_HEIGHT; row += 1) {
    const outOffset = row * rowBytes;
    raw[outOffset] = 0;
    raw.set(left.subarray(row * TILE_SIDE, (row + 1) * TILE_SIDE), outOffset + 1);
    raw.set(right.subarray(row * TILE_SIDE, (row + 1) * TILE_SIDE), outOffset + 1 + TILE_SIDE);
  }

  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, PINNED_PAIR_WIDTH);
  writeUint32(ihdr, 4, PINNED_PAIR_HEIGHT);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = new Uint8Array(deflateSync(raw));
  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', idat);
  const iendChunk = chunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(
    PNG_SIGNATURE.byteLength + ihdrChunk.byteLength + idatChunk.byteLength + iendChunk.byteLength,
  );
  let offset = 0;
  for (const part of [PNG_SIGNATURE, ihdrChunk, idatChunk, iendChunk]) {
    png.set(part, offset);
    offset += part.byteLength;
  }
  return png;
}
