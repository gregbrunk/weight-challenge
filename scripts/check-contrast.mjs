#!/usr/bin/env node
/* Re-measure every contrast pair this app's palette depends on.
 *
 *   npm run check:contrast
 *
 * Reads src/app/tokens.css directly, so it can never drift from the values the
 * app actually ships. Several pairs sit close to the AA floor and a few are
 * deliberate failures (container tones, mid-tone status fills), so run this
 * rather than reasoning about the hexes by eye.
 *
 * The design system's own checker (in the material-ui skill) covers the
 * generic tokens. This one covers what is specific to this app: the five named
 * chart series, the pairs that share a chart, the meter fills against their
 * track, and the done-states that sit on a status fill.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/app/tokens.css"), "utf8");

const rgb = (h) => {
  h = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lin = (c) => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (h) => {
  const [r, g, b] = rgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const x = lum(a),
    y = lum(b);
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
};

/* Declarations are collected from EVERY block whose selector matches, because
   the tokens are split across more than one :root and more than one dark block
   (base palette, then the app's chart series). Later blocks win, which is the
   cascade's own rule for equal specificity. */
const collect = (selectorTest) => {
  const out = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().split("\n").pop().trim();
    if (!selectorTest(selector)) continue;
    for (const d of m[2].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
};
const resolve = (raw) => {
  const out = {};
  for (const key of Object.keys(raw)) {
    let v = raw[key],
      hops = 0;
    while (v?.startsWith("var(") && hops++ < 10) v = raw[v.slice(4, v.indexOf(")")).trim()];
    if (/^#[0-9A-Fa-f]{6}$/.test(v ?? "")) out[key] = v.toUpperCase();
  }
  return out;
};

const lightRaw = collect((s) => s === ":root");
const light = resolve(lightRaw);
const dark = resolve({ ...lightRaw, ...collect((s) => s.includes('[data-theme="dark"]')) });

for (const [name, T] of [["light", light], ["dark", dark]]) {
  const n = Object.keys(T).length;
  if (n < 30) throw new Error(`${name} theme resolved only ${n} tokens — the parser is not matching`);
}

let failures = 0;
const check = (pass, msg) => {
  console.log(`${pass ? "  ok  " : "  FAIL"}  ${msg}`);
  if (!pass) failures++;
};
const AA = 4.5;
const GRAPHIC = 3;

const assert = (fg, bg, min, label, invert = false) => {
  if (!fg || !bg) return check(false, `${label}: token did not resolve to a hex`);
  const r = ratio(fg, bg);
  check(
    invert ? r < min : r >= min,
    `${label}: ${r.toFixed(2)}:1 ${invert ? `(must stay under ${min} — it is a fill, not text)` : `(needs ${min})`}`,
  );
};

const SURFACES = [
  "--color-canvas",
  "--color-card",
  "--color-well",
  "--color-emphasis",
  "--color-surface-container-highest",
];

for (const [name, T] of [
  ["LIGHT", light],
  ["DARK", dark],
]) {
  console.log(`\n=== ${name} ===`);

  console.log("-- text holds on every surface --");
  for (const s of SURFACES) {
    const label = s.replace("--color-", "");
    assert(T["--color-text"], T[s], AA, `text on ${label}`);
    assert(T["--color-text-muted"], T[s], AA, `muted on ${label}`);
    assert(T["--color-outline"], T[s], GRAPHIC, `outline on ${label}`);
  }

  console.log("-- accent and status text hold on every surface --");
  for (const s of SURFACES)
    for (const c of [
      "--color-primary",
      "--color-success-text",
      "--color-warning-text",
      "--color-danger-text",
    ])
      assert(T[c], T[s], AA, `${c.replace("--color-", "")} on ${s.replace("--color-", "")}`);

  console.log("-- every fill uses its designated on- colour --");
  for (const [on, of_] of [
    ["--color-on-primary", "--color-primary"],
    ["--color-on-primary-container", "--color-primary-container"],
    ["--color-on-secondary-container", "--color-secondary-container"],
    ["--color-on-success", "--color-success"],
    ["--color-on-warning", "--color-warning"],
    ["--color-on-danger", "--color-danger"],
  ])
    assert(
      T[on],
      T[of_],
      AA,
      `${on.replace("--color-", "")} on ${of_.replace("--color-", "")}`,
    );

  console.log("-- meter fills are graphical objects on their own track --");
  for (const f of ["--color-success-text", "--color-warning-text", "--color-danger-text", "--color-text-muted"])
    assert(T[f], T["--color-emphasis"], GRAPHIC, `${f.replace("--color-", "")} bar on the meter track`);

  console.log("-- chart series: a line needs 3:1 on the card it is drawn on --");
  const SERIES = [
    "--chart-weight",
    "--chart-bodyfat",
    "--chart-vo2",
    "--chart-systolic",
    "--chart-diastolic",
    "--chart-goal",
  ];
  for (const c of SERIES) assert(T[c], T["--color-card"], GRAPHIC, `${c} on the card`);

  /* Series that share a chart also need to differ in LUMINANCE, not just hue:
     equal-luminance hues are identical in greyscale and to some forms of
     colour blindness. Series on different charts are never compared. */
  console.log("-- series that share a chart differ in luminance too --");
  for (const [a, b] of [
    ["--chart-weight", "--chart-goal"],
    ["--chart-systolic", "--chart-diastolic"],
  ]) {
    const r = ratio(T[a], T[b]);
    check(r >= 1.4, `${a} vs ${b} (same chart): ${r.toFixed(2)}:1 separation (needs 1.4)`);
  }
}

console.log("\n=== deliberate non-text values (regressions if they start passing as text) ===");
assert(light["--color-secondary-container"], light["--color-card"], AA, "secondary-container as text", true);
assert(light["--color-success"], light["--color-card"], AA, "success FILL as text", true);
assert(light["--color-warning"], light["--color-card"], AA, "warning FILL as text", true);
assert(light["--color-danger"], light["--color-emphasis"], AA, "danger FILL as text on --color-emphasis", true);
assert(dark["--color-primary"], light["--color-card"], GRAPHIC, "dark primary on a light card", true);

console.log("\n=== a card is separated by its border, not by its tone ===");
for (const [n, T] of [
  ["light", light],
  ["dark", dark],
]) {
  const r = ratio(T["--color-card"], T["--color-canvas"]);
  check(
    r < 1.2,
    `${n}: card vs canvas is ${r.toFixed(3)}:1 — far under 3:1, so a card must carry a border or a shadow`,
  );
}

console.log(
  failures
    ? `\n${failures} failure(s) — fix the token, do not relax the threshold.`
    : "\nAll contrast pairs pass.",
);
process.exit(failures ? 1 : 0);
