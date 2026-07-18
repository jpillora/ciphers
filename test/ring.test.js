import { expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import {
  DEFAULT_ALPHABET,
  RING,
  buildRingPdf,
  normalizeAlphabet,
  polar,
  unprintableGlyphs,
  wheelSVG,
  windowPath,
} from "../src/ring.js";

test("default PDF: 2 A4 pages", async () => {
  const bytes = await buildRingPdf();
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(2);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    expect(width).toBeCloseTo(595.28, 1); // A4 portrait
    expect(height).toBeCloseTo(841.89, 1);
  }
});

test("custom alphabet + title PDF builds", async () => {
  const bytes = await buildRingPdf({ alphabet: "ABCDEFGHIJKLM", title: "OJ Ring" });
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(2);
});

test("PDF rejects glyphs its fonts can't print", async () => {
  expect(unprintableGlyphs(["A", "Ω", "🙂", "é"])).toEqual(["Ω", "🙂"]);
  await expect(buildRingPdf({ alphabet: "ΑΒΓΔΕ" })).rejects.toThrow(/can't print/);
});

test("normalizeAlphabet: dedupes, strips whitespace, falls back", () => {
  expect(normalizeAlphabet("A B  BA C")).toEqual(["A", "B", "C"]);
  expect(normalizeAlphabet("")).toEqual(Array.from(DEFAULT_ALPHABET));
  expect(normalizeAlphabet("X")).toEqual(Array.from(DEFAULT_ALPHABET)); // too short
  expect(normalizeAlphabet("🙂🙃")).toEqual(["🙂", "🙃"]); // code points, not UTF-16 units
});

test("geometry: discs nest and lettering stays visible", () => {
  expect(RING.inner.cut).toBeLessThan(RING.outer.cut);
  // Outer letters + numbers sit in the annulus the inner disc leaves visible.
  expect(RING.outer.numbers).toBeGreaterThan(RING.inner.cut);
  expect(RING.outer.letters).toBeGreaterThan(RING.inner.cut);
  expect(RING.outer.letters).toBeLessThan(RING.outer.cut);
  expect(RING.inner.letters).toBeLessThan(RING.inner.cut);
  // The outer disc fits on A4 portrait (210mm wide).
  expect(RING.outer.cut * 2).toBeLessThan(210);
});

test("geometry: shift window reveals the hidden number ring", () => {
  const { rIn, rOut, halfAngle } = RING.window;
  expect(rOut).toBeLessThan(RING.inner.band); // hole inside the letter band
  expect(rIn).toBeGreaterThan(8); // clear of the pin crosshair
  expect(rOut).toBeLessThan(RING.inner.cut); // numbers covered except via the window
  expect(RING.outer.shift).toBeCloseTo((rIn + rOut) / 2); // ring centred in the slot
  expect(halfAngle).toBeLessThan(360 / 26 / 2); // one number visible at a time
});

test("polar: clockwise from 12 o'clock, y down (screen convention)", () => {
  expect(polar(10, 0).x).toBeCloseTo(0);
  expect(polar(10, 0).y).toBeCloseTo(-10); // up
  expect(polar(10, 90).x).toBeCloseTo(10); // 3 o'clock
  expect(polar(10, 90).y).toBeCloseTo(0);
});

test("windowPath scales radii but never the arc flags", () => {
  const pt = windowPath(72 / 25.4);
  // Arc command keeps literal `0 0 1` / `0 0 0` flags.
  expect(pt).toMatch(/A [\d.]+ [\d.]+ 0 0 1 /);
  expect(pt).toMatch(/A [\d.]+ [\d.]+ 0 0 0 /);
  // Outer radius token is scaled mm→pt.
  const r = parseFloat(pt.split("A ")[1]);
  expect(r).toBeCloseTo((RING.window.rOut * 72) / 25.4, 1);
});

test("wheelSVG: rotation lands on the transform, window is a real hole", () => {
  const svg = wheelSVG({ rotation: 180 });
  expect(svg).toContain(`class="wheel-inner" transform="rotate(180)"`);
  expect(svg).toContain(`fill-rule="evenodd"`);
  // 26 letters × 2 rings + 26 numbers + 26 shift numbers + title + credit.
  expect(svg.split("<text").length - 1).toBe(26 * 4 + 2);
});
