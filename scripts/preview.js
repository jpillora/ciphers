// Regenerate docs/preview.svg (embedded in the README): the default wheel at
// shift 3 — inner A on outer D, window showing 3.  Run: bun scripts/preview.js
import { wheelSVG } from "../src/ring.js";

const svg = wheelSVG({ rotation: (3 * 360) / 26 });
await Bun.write(new URL("../docs/preview.svg", import.meta.url), svg);
console.log("wrote docs/preview.svg");
