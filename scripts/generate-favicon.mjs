#!/usr/bin/env node
/**
 * Build the MTC search favicon from the roof mark only.
 *
 * Polygons are the four red roof planes traced from
 * public/assets/img/logo/logo.png (the primary logo, roofs above the wordmark).
 * Chimney and eave corners were checked against the source pixel edges.
 * No wordmark, maple leaf, or house-wall outlines — those disappear at 16px.
 *
 * The mark sits in the centre ~78% of a square so a circular crop keeps it.
 * White on #C0202F stays visible in Google's white circle and on a dark circle.
 *
 * Usage: node scripts/generate-favicon.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RED = [0xc0, 0x20, 0x2f];
const WHITE = [255, 255, 255];

// Source pixel space of public/assets/img/logo/logo.png (y grows downward).
const ROOFS = [
  // Large right roof and its chimney.
  [
    [2702, 772],
    [4014, 772],
    [4014, 426],
    [4420, 426],
    [4420, 772],
    [4767, 772],
    [5698, 1700],
    [5698, 2700],
  ],
  // Centre parallelogram.
  [
    [2660, 818],
    [3506, 1364],
    [2356, 2340],
    [1762, 1758],
  ],
  // Left roof and its chimney.
  [
    [1020, 1034],
    [1948, 1034],
    [1948, 772],
    [2252, 772],
    [2252, 1034],
    [2368, 1034],
    [1716, 1716],
  ],
  // Far-left roof plane.
  [
    [426, 1772],
    [980, 1082],
    [1440, 1532],
    [426, 2364],
  ],
];

const BOUNDS = { x: 426, y: 426, w: 5272, h: 2274 };
const MARK_FILL = 0.78;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

export function encodePng(size, rgb) {
  if (rgb.length !== size * size * 3) throw new Error("RGB buffer size mismatch");
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    rgb.copy(raw, row + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

function fillPolygon(mask, size, points) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const yStart = Math.max(0, Math.floor(minY));
  const yEnd = Math.min(size - 1, Math.ceil(maxY));
  const n = points.length;
  for (let y = yStart; y <= yEnd; y++) {
    const scanY = y + 0.5;
    const hits = [];
    for (let i = 0; i < n; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % n];
      if ((y1 <= scanY && y2 > scanY) || (y2 <= scanY && y1 > scanY)) {
        const t = (scanY - y1) / (y2 - y1);
        hits.push(x1 + t * (x2 - x1));
      }
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const left = Math.max(0, Math.ceil(hits[i] - 0.5));
      const right = Math.min(size - 1, Math.floor(hits[i + 1] - 0.5));
      for (let x = left; x <= right; x++) mask[y * size + x] = 1;
    }
  }
}

export function renderIcon(size, { fg = WHITE, bg = RED, fill = MARK_FILL, supersample = 4 } = {}) {
  const sample = size * supersample;
  const mask = new Uint8Array(sample * sample);
  const markW = sample * fill;
  const scale = markW / BOUNDS.w;
  const markH = BOUNDS.h * scale;
  const originX = (sample - markW) / 2;
  const originY = (sample - markH) / 2;
  for (const roof of ROOFS) {
    fillPolygon(
      mask,
      sample,
      roof.map(([x, y]) => [originX + (x - BOUNDS.x) * scale, originY + (y - BOUNDS.y) * scale]),
    );
  }
  const rgb = Buffer.alloc(size * size * 3);
  const area = supersample * supersample;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < supersample; sy++) {
        const row = (y * supersample + sy) * sample;
        for (let sx = 0; sx < supersample; sx++) cover += mask[row + x * supersample + sx];
      }
      const t = cover / area;
      const i = (y * size + x) * 3;
      rgb[i] = Math.round(bg[0] + (fg[0] - bg[0]) * t);
      rgb[i + 1] = Math.round(bg[1] + (fg[1] - bg[1]) * t);
      rgb[i + 2] = Math.round(bg[2] + (fg[2] - bg[2]) * t);
    }
  }
  return rgb;
}

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

function crisp16(rgb) {
  const size = 16;
  const cover = new Float32Array(size * size);
  const solid = new Uint8Array(size * size);
  for (let i = 0; i < cover.length; i++) {
    cover[i] = (rgb[i * 3] - RED[0]) / (WHITE[0] - RED[0]);
    if (cover[i] >= 0.4) solid[i] = 1;
  }
  // The right chimney is about one pixel at 16px. Give that peak one extra pixel
  // so it still reads as a chimney in a browser tab.
  let top = -1;
  for (let y = 0; y < size && top < 0; y++) {
    for (let x = 0; x < size; x++) {
      if (solid[y * size + x]) {
        top = y;
        break;
      }
    }
  }
  if (top > 0) {
    let count = 0;
    for (let x = 0; x < size; x++) count += solid[top * size + x];
    if (count > 0 && count <= 2) {
      for (let x = 0; x < size; x++) {
        if (solid[top * size + x]) solid[(top - 1) * size + x] = 1;
      }
    }
  }
  const out = Buffer.alloc(rgb.length);
  for (let i = 0; i < cover.length; i++) {
    const blend = solid[i] ? 1 : cover[i] <= 0.15 ? 0 : cover[i];
    out[i * 3] = Math.round(RED[0] + (WHITE[0] - RED[0]) * blend);
    out[i * 3 + 1] = Math.round(RED[1] + (WHITE[1] - RED[1]) * blend);
    out[i * 3 + 2] = Math.round(RED[2] + (WHITE[2] - RED[2]) * blend);
  }
  return out;
}

function assertBrand(size, rgb) {
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i];
    const g = rgb[i + 1];
    const b = rgb[i + 2];
    const onBrand =
      r >= RED[0] &&
      r <= 255 &&
      g >= RED[1] &&
      g <= 255 &&
      b >= RED[2] &&
      b <= 255 &&
      g <= r &&
      b <= r + 8;
    if (!onBrand) {
      throw new Error(`Off-brand pixel in ${size}px icon at byte ${i}: ${r},${g},${b}`);
    }
  }
  const corners = [0, (size - 1) * 3, (size * (size - 1)) * 3, (size * size - 1) * 3];
  for (const i of corners) {
    if (rgb[i] !== RED[0] || rgb[i + 1] !== RED[1] || rgb[i + 2] !== RED[2]) {
      throw new Error(`${size}px icon corner is not solid #C0202F`);
    }
  }
  let white = 0;
  let maxDistance = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const cover = (rgb[i] - RED[0]) / (WHITE[0] - RED[0]);
      if (rgb[i] > 240 && rgb[i + 1] > 240 && rgb[i + 2] > 240) white++;
      if (cover > 0.25) {
        const distance = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5);
        if (distance > maxDistance) maxDistance = distance;
      }
    }
  }
  if (white < Math.max(4, size / 4)) throw new Error(`${size}px icon has too little white roof`);
  if (maxDistance > 0.47) {
    throw new Error(`${size}px roof reaches ${maxDistance.toFixed(3)} of the square, outside the circular crop`);
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
  const outputs = [16, 32, 48, 180, 192, 512];
  const pngs = new Map();

  for (const size of outputs) {
    const supersample = size <= 48 ? 8 : 4;
    let rgb = renderIcon(size, { supersample });
    if (size === 16) rgb = crisp16(rgb);
    assertBrand(size, rgb);
    const png = encodePng(size, rgb);
    pngs.set(size, png);
    const name = size === 180 ? "apple-touch-icon.png" : `favicon-${size}.png`;
    writeFileSync(join(publicDir, name), png);
    console.log(`${name} ${png.length} bytes`);
  }

  const ico = encodeIco([16, 32, 48].map((size) => ({ size, png: pngs.get(size) })));
  writeFileSync(join(publicDir, "favicon.ico"), ico);
  console.log(`favicon.ico ${ico.length} bytes`);
}
