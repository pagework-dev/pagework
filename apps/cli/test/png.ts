import { inflateSync } from "node:zlib";

/** An 8-bit greyscale image. */
export interface Grey {
  width: number;
  height: number;
  pixels: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Decodes the PNGs pdftoppm writes: 8-bit greyscale or RGB, not interlaced,
 * converted to grey. Enough for comparing rendered pages without an image
 * library.
 */
export function decodeGreyPng(file: Uint8Array): Grey {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let width = 0;
  let height = 0;
  let channels = 1;
  const data: Uint8Array[] = [];
  for (let at = 8; at < file.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...file.subarray(at + 4, at + 8));
    const body = file.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || (colour !== 0 && colour !== 2) || interlace !== 0)
        throw new Error(
          "Only 8-bit grey or RGB, non-interlaced PNGs are supported",
        );
      channels = colour === 2 ? 3 : 1;
    } else if (type === "IDAT") {
      data.push(body);
    }
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const bytes = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x] ?? 0;
      const left = x >= channels ? (bytes[y * stride + x - channels] ?? 0) : 0;
      const up = y > 0 ? (bytes[(y - 1) * stride + x] ?? 0) : 0;
      const corner =
        x >= channels && y > 0
          ? (bytes[(y - 1) * stride + x - channels] ?? 0)
          : 0;
      const predicted =
        filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? (left + up) >> 1
              : filter === 4
                ? paeth(left, up, corner)
                : 0;
      bytes[y * stride + x] = (value + predicted) & 0xff;
    }
  }
  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += bytes[i * channels + c] ?? 0;
    pixels[i] = Math.round(sum / channels);
  }
  return { width, height, pixels };
}

/** Share of pixels that differ by more than `threshold` grey levels. */
export function differingShare(a: Grey, b: Grey, threshold = 64): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let differing = 0;
  for (let i = 0; i < a.pixels.length; i++)
    if (Math.abs((a.pixels[i] ?? 0) - (b.pixels[i] ?? 0)) > threshold)
      differing++;
  return differing / a.pixels.length;
}
