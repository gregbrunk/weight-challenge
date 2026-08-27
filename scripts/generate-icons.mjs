/**
 * Generates the app icons from a single SVG definition.
 *
 * Committed as a script rather than hand-made binaries so the mark can be
 * changed in one place and re-rendered: `npm run icons`.
 *
 * The mark is a bathroom scale on a violet field: a rounded platform with a
 * dial and a needle. It is drawn heavy and simple because it has to survive
 * being 32 pixels wide in a browser tab — at that size the needle is the only
 * thing separating it from a plain rounded square, so it is the boldest stroke
 * in the mark and it points off-centre, where a symmetrical one would read as
 * a cross.
 */

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

// The design system's primary, and its on-colour.
const VIOLET = "#6442d6";
const INK = "#f5f1fa";

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
  const stroke = Math.max(2, Math.round(size * 0.07));

  // The platform: a rounded square, squatter than it is wide, the way a scale
  // reads when you look down at it.
  const platformH = box * 0.86;
  const platformY = inset + (box - platformH) / 2;
  const platformR = box * 0.2;

  // The dial sits high on the platform, leaving the lower third as the tread —
  // the proportion that makes it a scale rather than a picture frame. Its ring
  // is deliberately lighter than every other stroke so the needle inside it is
  // the thing the eye lands on; equal weights turned the pair into a single
  // grey blob at favicon size.
  const dialR = box * 0.22;
  const dialX = inset + box / 2;
  const dialY = platformY + platformH * 0.4;
  const dialStroke = Math.max(1.5, stroke * 0.62);

  // The needle runs from a hub at the centre out to just inside the ring, at
  // about one o'clock. It stops at the hub rather than crossing it: a line
  // through the middle of a circle reads as a "no entry" slash, which is a bad
  // thing for an icon to almost say.
  const angle = -Math.PI / 3.2;
  const tipX = dialX + Math.cos(angle) * dialR * 0.72;
  const tipY = dialY + Math.sin(angle) * dialR * 0.72;
  const hubR = Math.max(1, stroke * 0.55);

  const n = (value) => value.toFixed(1);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${VIOLET}"/>
  <rect x="${n(inset)}" y="${n(platformY)}" width="${n(box)}" height="${n(platformH)}"
    rx="${n(platformR)}" fill="none" stroke="${INK}" stroke-width="${stroke}"/>
  <circle cx="${n(dialX)}" cy="${n(dialY)}" r="${n(dialR)}"
    fill="none" stroke="${INK}" stroke-width="${n(dialStroke)}" opacity="0.75"/>
  <line x1="${n(dialX)}" y1="${n(dialY)}" x2="${n(tipX)}" y2="${n(tipY)}"
    stroke="${INK}" stroke-width="${stroke}" stroke-linecap="round"/>
  <circle cx="${n(dialX)}" cy="${n(dialY)}" r="${n(hubR)}" fill="${INK}"/>
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
