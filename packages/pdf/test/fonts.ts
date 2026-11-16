/// <reference types="vite/client" />
import type { CourierPrime } from "../src/index.ts";

// Vite inlines the font files as base64 data URLs, which keeps the tests free
// of Node APIs like the package itself.
const files = import.meta.glob<string>("../fonts/*.ttf", {
  query: "?inline",
  import: "default",
  eager: true,
});

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const ch of clean) {
    value = (value << 6) | BASE64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

function font(name: string): Uint8Array {
  const url = files[`../fonts/CourierPrime-${name}.ttf`];
  if (url === undefined) throw new Error(`missing font ${name}`);
  return decodeBase64(url.slice(url.indexOf(",") + 1));
}

export const fonts: CourierPrime = {
  regular: font("Regular"),
  bold: font("Bold"),
  italic: font("Italic"),
  boldItalic: font("BoldItalic"),
};
