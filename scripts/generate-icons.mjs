/**
 * Generates the app icons from a single SVG definition.
 *
 * Committed as a script rather than hand-made binaries so the mark can be
 * changed in one place and re-rendered: `npm run icons`.
 *
 * The mark is a descending line on a sage field — the weight trend, which is
 * what the app is for. It is drawn heavy and simple because it has to survive
 * being 32 pixels wide in a browser tab.
 */

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const SAGE = "#4f6f52";
const INK = "#f4f7f4";

/**
 * @param size    canvas size in pixels
 * @param bleed   true for maskable icons, which must fill the whole square
 *                because the platform crops them to its own shape
 */
function markSvg(size, bleed) {
  const radius = bleed ? 0 : Math.round(size * 0.22);
  // Keep the line inside the maskable safe zone — the middle 80% — so no
  // platform's circular or squircle crop can clip it.
  const inset = size * 0.24;
  const width = size - inset * 2;
  const stroke = Math.max(2, Math.round(size * 0.075));

  const x = (t) => inset + width * t;
  const y = (t) => inset + width * t;

  // A downward trend with one plateau, so it reads as a real weight curve
  // rather than a generic arrow.
  const points = [
    [x(0), y(0.06)],
    [x(0.3), y(0.42)],
    [x(0.52), y(0.34)],
    [x(0.78), y(0.72)],
    [x(1), y(0.86)],
  ]
    .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
    .join(" ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${SAGE}"/>
  <polyline points="${points}" fill="none" stroke="${INK}"
    stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${x(1).toFixed(1)}" cy="${y(0.86).toFixed(1)}" r="${(stroke * 0.85).toFixed(1)}" fill="${INK}"/>
</svg>`;
}

const targets = [
  // Maskable icons bleed to the edges; the platform applies its own shape.
  { file: "public/icon-192.png", size: 192, bleed: true },
  { file: "public/icon-512.png", size: 512, bleed: true },
  // Apple applies its own rounding, so this one bleeds too.
  { file: "src/app/apple-icon.png", size: 180, bleed: true },
  // The browser tab favicon keeps its own rounded corners.
  { file: "src/app/icon.png", size: 64, bleed: false },
];

for (const { file, size, bleed } of targets) {
  const path = resolve(process.cwd(), file);
  await mkdir(dirname(path), { recursive: true });
  await sharp(Buffer.from(markSvg(size, bleed))).png().toFile(path);
  console.log(`wrote ${file} (${size}px${bleed ? ", maskable" : ""})`);
}
