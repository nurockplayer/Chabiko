import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  PINNED_PAIR_HEIGHT,
  PINNED_PAIR_WIDTH,
  TILE_BYTES,
  decodePinnedGlyphPng,
  renderPinnedPair,
} from '../scripts/unicode_review_pixels';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function syntheticTile(seed: number): Uint8Array {
  const tile = new Uint8Array(TILE_BYTES);
  let state = seed >>> 0;
  for (let index = 0; index < TILE_BYTES; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    tile[index] = (state >>> 24) & 0xff;
  }
  return tile;
}

interface ParsedChunk {
  type: string;
  data: Uint8Array;
  declaredCrc: number;
  computedCrc: number;
  raw: Uint8Array;
}

interface ParsedPng {
  bytes: Uint8Array;
  chunks: ParsedChunk[];
}

function parsePng(bytes: Uint8Array): ParsedPng {
  expect(Array.from(bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
  const chunks: ParsedChunk[] = [];
  let offset = 8;
  while (offset < bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const length = view.getUint32(0);
    const raw = bytes.subarray(offset, offset + 12 + length);
    expect(raw.byteLength).toBe(12 + length);
    const type = String.fromCharCode(...raw.subarray(4, 8));
    const data = raw.subarray(8, 8 + length);
    const declaredCrc = new DataView(raw.buffer, raw.byteOffset + 8 + length).getUint32(0);
    const computedCrc = crc32(raw.subarray(4, 8 + length));
    chunks.push({ type, data, declaredCrc, computedCrc, raw });
    offset += 12 + length;
  }
  expect(offset).toBe(bytes.byteLength);
  return { bytes, chunks };
}

function readUint32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset).getUint32(0);
}

describe('#477 metadata-free pinned pair PNG', () => {
  const left = syntheticTile(0x1234_5678);
  const right = syntheticTile(0x9abc_def0);
  const leftSha256 = sha256(left);
  const rightSha256 = sha256(right);

  it('emits only IHDR, IDAT, IEND with valid CRCs and correct header fields', () => {
    const png = parsePng(renderPinnedPair(left, right, leftSha256, rightSha256));
    expect(png.chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    for (const chunk of png.chunks) {
      expect(chunk.declaredCrc).toBe(chunk.computedCrc);
    }
    const ihdr = png.chunks[0].data;
    expect(ihdr.byteLength).toBe(13);
    expect(readUint32(ihdr, 0)).toBe(PINNED_PAIR_WIDTH);
    expect(readUint32(ihdr, 4)).toBe(PINNED_PAIR_HEIGHT);
    expect(ihdr[8]).toBe(8);
    expect(ihdr[9]).toBe(0);
    expect(ihdr[10]).toBe(0);
    expect(ihdr[11]).toBe(0);
    expect(ihdr[12]).toBe(0);
    expect(png.chunks[2].data.byteLength).toBe(0);
  });

  it('places left then right horizontally at unchanged scale for every pixel', () => {
    const png = parsePng(renderPinnedPair(left, right, leftSha256, rightSha256));
    const raw = new Uint8Array(inflateSync(png.chunks[1].data));
    const rowBytes = PINNED_PAIR_WIDTH + 1;
    expect(raw.byteLength).toBe(rowBytes * PINNED_PAIR_HEIGHT);
    for (let row = 0; row < PINNED_PAIR_HEIGHT; row += 1) {
      const rowStart = row * rowBytes;
      expect(raw[rowStart]).toBe(0);
      for (let column = 0; column < PINNED_PAIR_WIDTH; column += 1) {
        const expected = column < 64 ? left[row * 64 + column] : right[row * 64 + (column - 64)];
        expect(raw[rowStart + 1 + column]).toBe(expected);
      }
    }
  });

  it('is deterministic across repeated calls', () => {
    const first = renderPinnedPair(left, right, leftSha256, rightSha256);
    const second = renderPinnedPair(left, right, leftSha256, rightSha256);
    expect(Array.from(first)).toEqual(Array.from(second));
    expect(sha256(first)).toBe(sha256(second));
  });

  it('does not mutate caller buffers', () => {
    const leftCopy = Uint8Array.from(left);
    const rightCopy = Uint8Array.from(right);
    renderPinnedPair(left, right, leftSha256, rightSha256);
    expect(Array.from(left)).toEqual(Array.from(leftCopy));
    expect(Array.from(right)).toEqual(Array.from(rightCopy));
    expect(sha256(left)).toBe(leftSha256);
    expect(sha256(right)).toBe(rightSha256);
  });

  it('rejects tiles whose byte length is not exactly 4096', () => {
    expect(() => renderPinnedPair(left.subarray(0, 4095), right, sha256(left.subarray(0, 4095)), rightSha256)).toThrow();
    const extended = new Uint8Array(TILE_BYTES + 1);
    extended.set(left);
    expect(() => renderPinnedPair(extended, right, sha256(extended), rightSha256)).toThrow();
  });

  it('rejects malformed or mismatched SHA-256 declarations', () => {
    expect(() => renderPinnedPair(left, right, leftSha256.toUpperCase(), rightSha256)).toThrow();
    expect(() => renderPinnedPair(left, right, leftSha256.slice(0, 63), rightSha256)).toThrow();
    expect(() => renderPinnedPair(left, right, 'z'.repeat(64), rightSha256)).toThrow();
    expect(() => renderPinnedPair(left, right, rightSha256, rightSha256)).toThrow();
    expect(() => renderPinnedPair(left, right, leftSha256, leftSha256)).toThrow();
  });
});

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from(type, (character) => character.charCodeAt(0));
  const chunk = new Uint8Array(12 + data.byteLength);
  writeUint32(chunk, 0, data.byteLength);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(4 + data.byteLength);
  crcInput.set(typeBytes);
  crcInput.set(data, 4);
  writeUint32(chunk, 8 + data.byteLength, crc32(crcInput));
  return chunk;
}

function filterPngRows(pixels: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const rowBytes = width * channels;
  const raw = new Uint8Array(height * (rowBytes + 1));
  for (let row = 0; row < height; row += 1) {
    const filter = row % 5;
    const rawOffset = row * (rowBytes + 1);
    const rowOffset = row * rowBytes;
    raw[rawOffset] = filter;
    for (let column = 0; column < rowBytes; column += 1) {
      const value = pixels[rowOffset + column];
      const left = column >= channels ? pixels[rowOffset + column - channels] : 0;
      const above = row > 0 ? pixels[rowOffset - rowBytes + column] : 0;
      const upperLeft = row > 0 && column >= channels ? pixels[rowOffset - rowBytes + column - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const estimate = left + above - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const aboveDistance = Math.abs(estimate - above);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        predictor = leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
          ? left
          : aboveDistance <= upperLeftDistance ? above : upperLeft;
      }
      raw[rawOffset + 1 + column] = (value - predictor) & 0xff;
    }
  }
  return raw;
}

function syntheticPngPixels(width: number, height: number, colorType: 0 | 2 | 6): Uint8Array {
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : 4;
  const pixels = new Uint8Array(width * height * channels);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * channels;
    pixels[offset] = (index * 17 + 31) & 0xff;
    if (channels > 1) {
      pixels[offset + 1] = (index * 43 + 97) & 0xff;
      pixels[offset + 2] = (index * 71 + 19) & 0xff;
    }
    if (channels === 4) pixels[offset + 3] = 255;
  }
  return pixels;
}

function expectedGrayscale(pixels: Uint8Array, colorType: 0 | 2 | 6): Uint8Array {
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : 4;
  const grayscale = new Uint8Array(TILE_BYTES);
  for (let index = 0; index < TILE_BYTES; index += 1) {
    const offset = index * channels;
    grayscale[index] = colorType === 0
      ? pixels[offset]
      : Math.floor((299 * pixels[offset] + 587 * pixels[offset + 1] + 114 * pixels[offset + 2] + 500) / 1000);
  }
  return grayscale;
}

function syntheticGlyphPng(options: {
  readonly width?: number;
  readonly height?: number;
  readonly colorType: 0 | 2 | 6;
  readonly pixels?: Uint8Array;
  readonly beforeIdat?: readonly Uint8Array[];
  readonly splitIdat?: boolean;
  readonly compressed?: Uint8Array;
}): Uint8Array {
  const width = options.width ?? 64;
  const height = options.height ?? 64;
  const channels = options.colorType === 0 ? 1 : options.colorType === 2 ? 3 : 4;
  const pixels = options.pixels ?? syntheticPngPixels(width, height, options.colorType);
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = options.colorType;
  const compressed = options.compressed ?? new Uint8Array(deflateSync(filterPngRows(pixels, width, height, channels)));
  const idatChunks = options.splitIdat
    ? [pngChunk('IDAT', compressed.subarray(0, Math.floor(compressed.byteLength / 2))), pngChunk('IDAT', compressed.subarray(Math.floor(compressed.byteLength / 2)))]
    : [pngChunk('IDAT', compressed)];
  const parts = [Uint8Array.from(PNG_SIGNATURE), pngChunk('IHDR', ihdr), ...(options.beforeIdat ?? []), ...idatChunks, pngChunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.byteLength;
  }
  return png;
}

describe('#477 pinned historical glyph PNG decoder', () => {
  for (const colorType of [0, 2, 6] as const) {
    it(`decodes all PNG filters for opaque color type ${colorType}`, () => {
      const pixels = syntheticPngPixels(64, 64, colorType);
      const expected = expectedGrayscale(pixels, colorType);
      const png = syntheticGlyphPng({ colorType, pixels, splitIdat: true });
      expect(Array.from(decodePinnedGlyphPng(png, sha256(expected)))).toEqual(Array.from(expected));
    });
  }

  it('rejects corruption, truncation, and invalid dimensions', () => {
    const expected = expectedGrayscale(syntheticPngPixels(64, 64, 0), 0);
    const valid = syntheticGlyphPng({ colorType: 0 });
    const corrupt = Uint8Array.from(valid);
    corrupt[corrupt.byteLength - 1] ^= 1;
    expect(() => decodePinnedGlyphPng(corrupt, sha256(expected))).toThrow(/CRC mismatch/);
    expect(() => decodePinnedGlyphPng(valid.subarray(0, valid.byteLength - 1), sha256(expected))).toThrow();
    expect(() => decodePinnedGlyphPng(syntheticGlyphPng({ colorType: 0, width: 63 }), sha256(expected))).toThrow(/64x64/);
  });

  it('rejects a wrong derivative checksum', () => {
    const png = syntheticGlyphPng({ colorType: 2 });
    expect(() => decodePinnedGlyphPng(png, '0'.repeat(64))).toThrow(/does not match/);
  });

  it('rejects transparent pixels and transparency chunks', () => {
    const rgba = syntheticPngPixels(64, 64, 6);
    rgba[3] = 254;
    expect(() => decodePinnedGlyphPng(syntheticGlyphPng({ colorType: 6, pixels: rgba }), sha256(expectedGrayscale(rgba, 6)))).toThrow(/transparent/);
    const rgb = syntheticPngPixels(64, 64, 2);
    expect(() => decodePinnedGlyphPng(
      syntheticGlyphPng({ colorType: 2, pixels: rgb, beforeIdat: [pngChunk('tRNS', Uint8Array.of(0, 0, 0, 0, 0, 0))] }),
      sha256(expectedGrayscale(rgb, 2)),
    )).toThrow(/unsupported PNG chunk tRNS/);
  });

  it('rejects arbitrary metadata, invalid zlib data, and out-of-order chunks', () => {
    const expected = expectedGrayscale(syntheticPngPixels(64, 64, 0), 0);
    expect(() => decodePinnedGlyphPng(
      syntheticGlyphPng({ colorType: 0, beforeIdat: [pngChunk('tEXt', Uint8Array.from([107, 0, 118]))] }),
      sha256(expected),
    )).toThrow(/unsupported PNG chunk tEXt/);
    expect(() => decodePinnedGlyphPng(
      syntheticGlyphPng({ colorType: 0, compressed: Uint8Array.of(0xde, 0xad, 0xbe, 0xef) }),
      sha256(expected),
    )).toThrow(/invalid zlib/);
    expect(() => decodePinnedGlyphPng(
      syntheticGlyphPng({ colorType: 0, beforeIdat: [pngChunk('IHDR', new Uint8Array(13))] }),
      sha256(expected),
    )).toThrow(/unsupported PNG chunk IHDR/);
  });
});
