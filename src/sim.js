// Interactive simulation: the assembled wheel with a draggable top disc.
//
// mountSim() renders wheelSVG() into a container and drives the `.wheel-inner`
// group's rotate() transform from pointer events. Drags accumulate small
// angle deltas (robust across the atan2 ±180° seam); release snaps to the
// nearest sector so the wheel always rests on a whole shift. Arrow keys step
// one sector at a time.

import { normalizeAlphabet, wheelSVG } from "./ring.js";

const mod = (v, n) => ((v % n) + n) % n;
const norm180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * @param container element to render into
 * @param opts { alphabet, title }
 * @param onShift called with the current shift k (integer) whenever it changes
 */
export function mountSim(container, opts, onShift) {
  let glyphs = normalizeAlphabet(opts.alphabet);
  let title = opts.title;
  let rotation = 0; // continuous degrees, snapped to k·step at rest
  let inner = null;
  let anim = 0;

  const step = () => 360 / glyphs.length;
  const shift = () => mod(Math.round(rotation / step()), glyphs.length);

  const apply = () => {
    inner?.setAttribute("transform", `rotate(${rotation.toFixed(3)})`);
    onShift?.(shift());
  };

  const animateTo = (target) => {
    cancelAnimationFrame(anim);
    const from = rotation;
    const delta = target - from;
    const t0 = performance.now();
    const D = 140;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / D);
      rotation = from + delta * (1 - (1 - p) ** 3); // ease-out cubic
      apply();
      if (p < 1) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  };

  const snap = () => animateTo(Math.round(rotation / step()) * step());

  // Pointer angle around the disc centre, clockwise from 12 o'clock.
  const angleOf = (svg, e) => {
    const r = svg.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return (Math.atan2(dx, -dy) * 180) / Math.PI;
  };

  const render = () => {
    container.innerHTML = wheelSVG({ alphabet: glyphs.join(""), title, rotation });
    const svg = container.querySelector("svg");
    inner = svg.querySelector(".wheel-inner");
    svg.classList.add("sim");
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("role", "slider");
    svg.setAttribute("aria-label", "Rotate the top disc to set the shift");

    let dragging = false;
    let last = 0;
    svg.addEventListener("pointerdown", (e) => {
      cancelAnimationFrame(anim);
      dragging = true;
      last = angleOf(svg, e);
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    svg.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const a = angleOf(svg, e);
      rotation += norm180(a - last);
      last = a;
      apply();
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      snap();
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      animateTo((Math.round(rotation / step()) + dir) * step());
    });
    apply();
  };

  render();

  return {
    shift,
    setShift(k) {
      // Take the short way round from wherever the disc currently is.
      const target = rotation + norm180(k * step() - rotation);
      animateTo(target);
    },
    update(next) {
      glyphs = normalizeAlphabet(next.alphabet ?? glyphs.join(""));
      title = next.title ?? title;
      rotation = Math.round(rotation / step()) * step(); // re-snap to the (new) grid
      render();
    },
  };
}
