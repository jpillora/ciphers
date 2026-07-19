// Cipher-disk core: shared geometry + the two renderers.
//
// A cipher wheel is two discs pinned through the centre. Page 1 / the lower
// layer is the OUTER disc (r 90mm): the alphabet (plus 1..n) drawn in the
// annulus the inner disc leaves visible (65–90mm), and a hidden ring of shift
// numbers 0..n-1 at r 41mm. Page 2 / the upper layer is the INNER disc
// (r 65mm): the alphabet near its rim, and a window slot cut out on the
// pointer spoke. Rotated k steps, the window lands on shift number k.
//
// This module is pure ES (no DOM, no bundler): the browser imports it
// directly, `bun test` imports it directly, and `scripts/preview.js` uses it
// to write docs/preview.svg. pdf-lib is loaded lazily via dynamic import —
// the browser resolves it through the import map in index.html, bun through
// node_modules.

export const DEFAULT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const DEFAULT_TITLE = "Cipher Disk";
export const CREDIT = "ciphers.jpillora.com";

// All radii in mm. Everything on the outer disc inside r=65 is covered once
// assembled — only the 65–90 annulus (letters, numbers) and whatever shows
// through the window (the shift ring at r=41) is visible.
export const RING = {
  outer: { cut: 90, letters: 78, numbers: 69.5, shift: 41 },
  inner: { cut: 65, letters: 57, band: 49 },
  window: { rIn: 36, rOut: 46, halfAngle: 5.5 }, // slot in the inner disc, degrees each side
};

// θ measured clockwise from 12 o'clock. Screen/SVG convention (y down):
// a point at angle θ radius r is (r·sinθ, −r·cosθ).
export function polar(r, thetaDeg) {
  const t = (thetaDeg * Math.PI) / 180;
  return { x: r * Math.sin(t), y: -r * Math.cos(t) };
}

// Alphabet input → array of glyphs (code points): whitespace stripped,
// duplicates dropped, order kept. A wheel needs at least 2 symbols.
export function normalizeAlphabet(input) {
  const glyphs = [...new Set(Array.from((input || "").replace(/\s+/g, "")))];
  return glyphs.length >= 2 ? glyphs : Array.from(DEFAULT_ALPHABET);
}

// Letter sizes are tuned for the classic 26 — shrink proportionally when a
// longer alphabet tightens the sectors (never grow past the 26-glyph size).
const scaleFor = (n) => Math.min(1, 26 / n);

// SVG path for the shift window: an annular sector on the pointer spoke
// (local angle 0), rIn–rOut, ±halfAngle. Valid in both renderers — SVG uses
// it in mm units (scale 1), the PDF at mm→pt scale — and pdf-lib's
// drawSvgPath expects exactly this y-down convention.
export function windowPath(scale = 1) {
  const { rIn, rOut, halfAngle } = RING.window;
  const a = rIn * scale;
  const b = rOut * scale;
  const s = Math.sin((halfAngle * Math.PI) / 180);
  const c = Math.cos((halfAngle * Math.PI) / 180);
  const f = (v) => v.toFixed(2);
  return [
    `M ${f(-b * s)} ${f(-b * c)}`,
    `A ${f(b)} ${f(b)} 0 0 1 ${f(b * s)} ${f(-b * c)}`, // over the top, clockwise
    `L ${f(a * s)} ${f(-a * c)}`,
    `A ${f(a)} ${f(a)} 0 0 0 ${f(-a * s)} ${f(-a * c)}`, // inner arc back
    "Z",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// SVG renderer — the on-screen simulation (units = mm, origin = pin centre).
// The `.inner` group carries the rotation; sim.js drives its transform.
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// One glyph per sector centre, tops pointing outward: place at (0, −r) and
// rotate the group — SVG's clockwise rotate() matches our θ convention.
function svgGlyphRing(glyphs, r, fontSize, extra = "") {
  const step = 360 / glyphs.length;
  return glyphs
    .map(
      (g, i) =>
        `<g transform="rotate(${(i * step).toFixed(3)})"><text x="0" y="${-r}" ` +
        `text-anchor="middle" dominant-baseline="central" font-size="${fontSize.toFixed(2)}" ${extra}>${esc(g)}</text></g>`,
    )
    .join("");
}

// Light radial lines at the sector boundaries, as one path.
function svgTicks(n, rFrom, rTo) {
  const step = 360 / n;
  const d = Array.from({ length: n }, (_, i) => {
    const a = polar(rFrom, (i + 0.5) * step);
    const b = polar(rTo, (i + 0.5) * step);
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }).join(" ");
  return `<path d="${d}" stroke="#bbb" stroke-width="0.18" fill="none"/>`;
}

const svgCrosshair = (s) =>
  `<path d="M ${-s} 0 H ${s} M 0 ${-s} V ${s}" stroke="#888" stroke-width="0.18" fill="none"/>`;

// Fit `text` at `baseSize` into `maxWidth` mm (rough sans-serif 0.62em/char).
const fitSize = (text, baseSize, maxWidth) =>
  Math.min(baseSize, maxWidth / (0.62 * Math.max(1, Array.from(text).length)));

/**
 * The assembled wheel as an SVG string. `rotation` is the inner disc's angle
 * in degrees (k·360/n = shift k). The window is a real hole (even-odd fill),
 * so the shift number beneath shows through, exactly like the paper version.
 */
export function wheelSVG({ alphabet = DEFAULT_ALPHABET, title = DEFAULT_TITLE, rotation = 0 } = {}) {
  const glyphs = normalizeAlphabet(alphabet);
  const n = glyphs.length;
  const s = scaleFor(n);
  const { outer, inner, window: win } = RING;

  const out = [];
  out.push(`<g class="wheel-outer">`);
  out.push(`<circle r="${outer.cut}" fill="#fff" stroke="#000" stroke-width="0.5"/>`);
  out.push(`<circle r="${inner.cut}" fill="none" stroke="#ccc" stroke-width="0.18" stroke-dasharray="1.4 1.4"/>`);
  out.push(svgTicks(n, inner.cut, outer.cut));
  out.push(svgGlyphRing(glyphs, outer.letters, 7 * s, `font-weight="bold"`));
  out.push(svgGlyphRing(Array.from({ length: n }, (_, i) => String(i + 1)), outer.numbers, 2.8 * Math.max(s, 0.6), `fill="#777"`));
  // Hidden shift ring — number k at angle k·step, revealed through the window.
  out.push(svgGlyphRing(Array.from({ length: n }, (_, i) => String(i)), outer.shift, 3.9 * Math.max(s, 0.6), `font-weight="bold"`));
  out.push(svgCrosshair(4));
  out.push(`</g>`);

  // The rotating disc. Drawn as one path — full circle + window subpath —
  // with even-odd fill, so the window is transparent.
  const disc =
    `M 0 ${-inner.cut} A ${inner.cut} ${inner.cut} 0 1 1 0 ${inner.cut} ` +
    `A ${inner.cut} ${inner.cut} 0 1 1 0 ${-inner.cut} Z ${windowPath()}`;
  out.push(`<g class="wheel-inner" transform="rotate(${rotation})">`);
  out.push(`<path d="${disc}" fill-rule="evenodd" fill="#fff" stroke="#000" stroke-width="0.5" style="filter: drop-shadow(0 0.6px 1.2px rgba(0,0,0,0.35))"/>`);
  out.push(`<circle r="${inner.band}" fill="none" stroke="#bbb" stroke-width="0.18"/>`);
  out.push(svgTicks(n, inner.band, inner.cut));
  out.push(svgGlyphRing(glyphs, inner.letters, 7 * s, `font-weight="bold"`));
  // Pointer box around the first glyph (at local angle 0).
  const bw = 9 * Math.max(s, 0.55);
  const bh = 8 * Math.max(s, 0.55);
  out.push(`<rect x="${(-bw / 2).toFixed(2)}" y="${(-inner.letters - bh / 2).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" rx="0.8" fill="none" stroke="#000" stroke-width="0.35"/>`);
  const titleSize = fitSize(title, 6.5, 82);
  out.push(`<text x="0" y="-20" text-anchor="middle" dominant-baseline="central" font-size="${titleSize.toFixed(2)}" font-weight="bold">${esc(title)}</text>`);
  out.push(`<text x="0" y="20" text-anchor="middle" dominant-baseline="central" font-size="2.6" fill="#999">${esc(CREDIT)}</text>`);
  out.push(svgCrosshair(4));
  out.push(`</g>`);

  // The pin.
  out.push(`<circle r="1.1" fill="#444"/>`);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-95 -95 190 190" ` +
    `font-family="Helvetica, Arial, sans-serif" text-rendering="geometricPrecision">${out.join("")}</svg>`
  );
}

// ---------------------------------------------------------------------------
// PDF renderer — the 2-page printable (A4 portrait, pdf-lib, standard fonts).
// ---------------------------------------------------------------------------

const A4 = { width: 595.28, height: 841.89 }; // pt
const mm = (v) => (v * 72) / 25.4;
const CENTER_Y = 470; // disc centre, pt from the page bottom

// Standard fonts are WinAnsi-encoded — reject glyphs they can't print rather
// than crashing inside pdf-lib. (The on-screen sim has no such limit.)
export function unprintableGlyphs(glyphs) {
  return glyphs.filter((g) => !/^[\x20-\x7E\u00A0-\u00FF]$/u.test(g));
}

/**
 * Build the 2-page printable PDF. Throws with a readable message if the
 * alphabet contains glyphs the PDF's built-in fonts can't print.
 */
export async function buildRingPdf({ alphabet = DEFAULT_ALPHABET, title = DEFAULT_TITLE } = {}) {
  const glyphs = normalizeAlphabet(alphabet);
  const bad = unprintableGlyphs(glyphs);
  if (bad.length) {
    throw new Error(`The PDF fonts can't print: ${bad.join(" ")} — remove them or stick to Latin-1 characters.`);
  }
  const n = glyphs.length;
  const s = scaleFor(n);
  const step = 360 / n;
  const { outer, inner } = RING;

  const { PDFDocument, StandardFonts, degrees, rgb } = await import("pdf-lib");
  const BLACK = rgb(0, 0, 0);
  const GRAY = rgb(0.45, 0.45, 0.45);
  const LIGHT = rgb(0.72, 0.72, 0.72);

  const doc = await PDFDocument.create();
  doc.setTitle(`${title} — printable cipher wheel`);
  doc.setAuthor(CREDIT);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const cx = A4.width / 2;
  const cy = CENTER_Y;
  // pdf y grows UP, so a point at θ is (cx + r·sinθ, cy + r·cosθ).
  const at = (rMm, thetaDeg) => {
    const p = polar(mm(rMm), thetaDeg);
    return { x: cx + p.x, y: cy - p.y };
  };

  // Draw text centred on (x, y), rotated φ° CCW — pdf-lib rotates around the
  // baseline-left anchor, so shift it by the rotated half-extents.
  const centered = (page, font, text, size, x, y, phiDeg, color = BLACK) => {
    const w = font.widthOfTextAtSize(text, size);
    const h = size * 0.717; // Helvetica cap height
    const phi = (phiDeg * Math.PI) / 180;
    page.drawText(text, {
      x: x - (Math.cos(phi) * w) / 2 + (Math.sin(phi) * h) / 2,
      y: y - (Math.sin(phi) * w) / 2 - (Math.cos(phi) * h) / 2,
      size,
      font,
      color,
      rotate: degrees(phiDeg),
    });
  };

  const glyphRing = (page, font, items, rMm, size, color = BLACK) => {
    items.forEach((g, i) => {
      const theta = i * step;
      const p = at(rMm, theta);
      centered(page, font, g, size, p.x, p.y, -theta, color);
    });
  };

  const ticks = (page, rFromMm, rToMm) => {
    for (let i = 0; i < n; i++) {
      const theta = (i + 0.5) * step;
      page.drawLine({ start: at(rFromMm, theta), end: at(rToMm, theta), thickness: 0.5, color: LIGHT });
    }
  };

  const pinMark = (page) => {
    const sPt = mm(4);
    page.drawLine({ start: { x: cx - sPt, y: cy }, end: { x: cx + sPt, y: cy }, thickness: 0.5, color: GRAY });
    page.drawLine({ start: { x: cx, y: cy - sPt }, end: { x: cx, y: cy + sPt }, thickness: 0.5, color: GRAY });
    page.drawCircle({ x: cx, y: cy, size: mm(1.25), borderWidth: 0.75, borderColor: BLACK });
  };

  const header = (page, subtitle) => {
    const size = Math.min(20, (20 * mm(170)) / Math.max(1, bold.widthOfTextAtSize(title, 20)));
    centered(page, bold, title, size, cx, 806, 0);
    centered(page, regular, subtitle, 11, cx, 784, 0, GRAY);
  };

  const footer = (page, lines) => {
    lines.forEach((line, i) => centered(page, regular, line, 9.5, cx, 150 - i * 15, 0, GRAY));
  };

  const sizeLetters = 20 * s;
  const numbers = Array.from({ length: n }, (_, i) => String(i + 1));
  const shifts = Array.from({ length: n }, (_, i) => String(i));

  // ---- Page 1: outer disc (the base) ----
  const p1 = doc.addPage([A4.width, A4.height]);
  header(p1, `Disc 1 of 2 — large disc (base)`);
  p1.drawCircle({ x: cx, y: cy, size: mm(outer.cut), borderWidth: 1.2, borderColor: BLACK });
  // Dashed guide where the inner disc's edge will sit once stacked.
  p1.drawCircle({ x: cx, y: cy, size: mm(inner.cut), borderWidth: 0.5, borderColor: LIGHT, borderDashArray: [4, 4] });
  ticks(p1, inner.cut, outer.cut);
  glyphRing(p1, bold, glyphs, outer.letters, sizeLetters);
  glyphRing(p1, regular, numbers, outer.numbers, 8 * Math.max(s, 0.6), GRAY);
  // Hidden shift ring — number k at angle k·step, revealed through the window.
  glyphRing(p1, bold, shifts, outer.shift, 11 * Math.max(s, 0.6));
  pinMark(p1);
  footer(p1, [
    "Print both pages at 100% scale (no “fit to page”), then cut out both discs along the solid circles.",
    "Stack the small disc on this one and push a split pin through both centre marks.",
    `Rotate the small disc to set the key — the window below its pointer shows the shift (0–${n - 1}).`,
    "Encode: find each letter on the SMALL disc, write down the large-disc letter beside it. Decode: the reverse.",
  ]);

  // ---- Page 2: inner disc (the rotor) ----
  const p2 = doc.addPage([A4.width, A4.height]);
  header(p2, `Disc 2 of 2 — small disc (top)`);
  p2.drawCircle({ x: cx, y: cy, size: mm(inner.cut), borderWidth: 1.2, borderColor: BLACK });
  p2.drawCircle({ x: cx, y: cy, size: mm(inner.band), borderWidth: 0.5, borderColor: LIGHT });
  ticks(p2, inner.band, inner.cut);
  glyphRing(p2, bold, glyphs, inner.letters, sizeLetters);
  // Pointer box around the first glyph (at local angle 0).
  const aPos = at(inner.letters, 0);
  const bw = mm(9 * Math.max(s, 0.55));
  const bh = mm(8 * Math.max(s, 0.55));
  p2.drawRectangle({ x: aPos.x - bw / 2, y: aPos.y - bh / 2, width: bw, height: bh, borderWidth: 0.9, borderColor: BLACK });
  // Shift window: cut out — reveals the shift number on the disc beneath.
  // windowPath() is y-down (SVG convention), which is what drawSvgPath expects.
  p2.drawSvgPath(windowPath(72 / 25.4), { x: cx, y: cy, borderWidth: 1.2, borderColor: BLACK });
  const winMid = at(RING.outer.shift, 0);
  centered(p2, regular, "CUT", 6, winMid.x, winMid.y, 0, GRAY);
  // Centre decoration — this disc is on top, so it is never covered.
  const titleSize = Math.min(14, (14 * mm(82)) / Math.max(1, bold.widthOfTextAtSize(title, 14)));
  centered(p2, bold, title, titleSize, cx, cy + mm(20), 0);
  centered(p2, regular, CREDIT, 9, cx, cy - mm(20), 0, GRAY);
  pinMark(p2);
  footer(p2, [
    "Disc 2 of 2 — sits on top of the large disc from page 1. Cut out the small window slot as well.",
    "The boxed glyph is the pointer: the large-disc letter beside it is the key,",
    "and the window below it shows that key's shift number.",
  ]);

  return doc.save();
}
