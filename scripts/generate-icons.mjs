/**
 * Generates the app icons from a single SVG definition.
 *
 * Committed as a script rather than hand-made binaries so the mark can be
 * changed in one place and re-rendered: `npm run icons`.
 *
 * The mark is a bathroom scale — a rounded body with the dial arc across the
 * top — on the design system's violet. The artwork is an open-source icon from
 * SVG Repo (svgrepo.com), used unmodified in shape and recoloured to the app's
 * tokens; the paths below are its two originals, drawn on a 24-unit grid.
 *
 * It is redrawn at each size rather than scaled from one bitmap, and the stroke
 * is set as a fraction of the canvas rather than inherited from the source, so
 * the 64px favicon keeps a weight that survives being looked at in a tab.
 */

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

// The design system's primary, and its on-colour.
const VIOLET = "#6442d6";
const INK = "#f5f1fa";

/** The source artwork, on its own 24-unit grid. */
const MARK_GRID = 24;
const MARK_BODY =
  "M10 22H14C19 22 21 20 21 15V9C21 4 19 2 14 2H10C5 2 3 4 3 9V15C3 20 5 22 10 22Z";
const MARK_DIAL =
  "M17.25 8.29004C14.26 5.63004 9.74 5.63004 6.75 8.29004L8.93 11.79C10.68 10.23 13.32 10.23 15.07 11.79L17.25 8.29004Z";

/**
 * @param size    canvas size in pixels
 * @param bleed   true for maskable icons, which must fill the whole square
 *                because the platform crops them to its own shape
 */
function markSvg(size, bleed) {
  const radius = bleed ? 0 : Math.round(size * 0.22);

  // Keep the mark inside the maskable safe zone — the middle 80% — so no
  // platform's circular or squircle crop can clip it.
  const inset = size * 0.23;
  const box = size - inset * 2;
  const scale = box / MARK_GRID;

  // The source draws at 1.5 on a 24-unit grid, which scales down to a hairline
  // on a favicon. The weight is set against the canvas instead and converted
  // back into source units, so it reads the same at 64px and at 512px.
  const stroke = (size * 0.05) / scale;

  const n = (value) => value.toFixed(2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${VIOLET}"/>
  <g transform="translate(${n(inset)} ${n(inset)}) scale(${n(scale)})"
     fill="none" stroke="${INK}" stroke-width="${n(stroke)}"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="${MARK_BODY}"/>
    <path d="${MARK_DIAL}"/>
  </g>
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
