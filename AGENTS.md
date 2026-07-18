# ciphers

`ciphers.jpillora.com` — printable decoder-ring generator. **Pure frontend, no
build step**: plain ES modules served as-is, deployed by **GitHub Pages** from
`main` @ root (`.nojekyll` + committed `CNAME`; DNS is `CNAME ciphers →
jpillora.github.io`, unproxied). In the `jpillora.com` monorepo this repo is a
**git submodule** at `sites/ciphers` (no `wrangler.toml`, so `dev.ts` ignores
it; "deploy" = `git push`).

> If the repo ever goes **private** again: free-plan GitHub Pages dies with it.
> The escape hatch (used 2026-07-18) is a static-assets-only Worker named
> `ciphers` + DNS back to a Workers custom domain — see this file's history.

## Files

```
index.html      shell: controls, sim mount, import map (pdf-lib → jsdelivr CDN)
style.css
src/ring.js     THE CORE — geometry constants (RING) + wheelSVG() + buildRingPdf()
src/sim.js      mountSim(): drag-to-rotate top disc, sector snap, arrow keys
src/main.js     controls ↔ sim ↔ PDF download ↔ shareable #hash (t/a/s params)
test/ring.test.js  bun tests: PDF pages, geometry invariants, alphabet handling
scripts/preview.js  regenerates docs/preview.svg (README image)
```

## Architecture

- `src/ring.js` is **pure** (no DOM): both renderers live there. `wheelSVG()`
  returns the assembled wheel as an SVG string (mm units, origin = pin);
  `buildRingPdf()` builds the 2-page A4 printable. The browser, `bun test`,
  and `scripts/preview.js` all import it directly.
- **pdf-lib is lazy**: `buildRingPdf()` does `await import("pdf-lib")` — the
  browser resolves it via the import map (CDN, only fetched on download),
  bun via `node_modules` (the sole devDependency).
- **Geometry** (mm): outer disc r90 — alphabet r78, positions 1..n r69.5,
  hidden shift ring 0..n−1 at r41; inner disc r65 — alphabet r57, band r49,
  pointer box on glyph 0, **window slot** r36–46 ±5.5° on the pointer spoke.
  Rotated k steps, the window reveals shift number k (number k sits at angle
  k·360/n). Everything on the outer disc inside r65 is covered once stacked.
  Letter sizes scale by min(1, 26/n) for long alphabets. The tests pin all
  nesting invariants — keep them true when re-tuning radii.
- θ is **clockwise from 12 o'clock**, screen convention (y down) everywhere;
  only the PDF flips y at its `at()` helper. SVG `rotate()` matches directly.
- Encode convention: small-disc letter → large-disc letter beside it (so
  inner A on outer D = Caesar +3 = window shows 3).
- The sim's window is a real hole (single path + `fill-rule="evenodd"`), so
  the shift number genuinely shows through, like the paper wheel.
- PDF fonts are WinAnsi (Latin-1): `buildRingPdf()` throws a readable error
  for glyphs it can't print; the SVG sim has no such limit (emoji fine).

## Dev / deploy

```bash
bun install && bun test   # tests (pdf-lib only dep)
bun run serve             # local static server :8043
git push                  # = deploy (GitHub Pages, branch main, root)
```

`.nojekyll` keeps Pages from running Jekyll. Keep everything **relative-path**
so the site works at `jpillora.github.io/ciphers/` and at the custom domain
root alike.
