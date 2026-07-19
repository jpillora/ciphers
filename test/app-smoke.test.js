// Smoke test for the page wiring: shim just enough DOM for main.js + sim.js
// to load and run, then poke the controls. This is the regression net for
// "the wheel renders but the inputs are dead" (a module-load crash — e.g. the
// TDZ on `sim` inside the initial onShift — kills every listener silently).

import { beforeAll, expect, test } from "bun:test";

// ---- minimal DOM shim -----------------------------------------------------

function makeEl(id) {
  return {
    id,
    value: "",
    hidden: false,
    textContent: "",
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    fire(type, ev = {}) {
      for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, ...ev });
    },
  };
}

// The sim container: innerHTML is parsed only far enough to hand back an
// <svg> stub whose .wheel-inner transform sim.js drives. Like the real DOM,
// every innerHTML assignment produces FRESH elements — otherwise listeners
// from successive renders pile up on one stub and drags double-count.
function makeSimContainer() {
  const container = {
    ...makeEl("sim"),
    _html: "",
    svg: null,
    inner: null,
    set innerHTML(html) {
      this._html = html;
      this.inner = { ...makeEl("inner"), attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
      const inner = this.inner;
      this.svg = {
        ...makeEl("svg"),
        attrs: {},
        classList: { add() {} },
        setAttribute(k, v) { this.attrs[k] = v; },
        setPointerCapture() {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 190, height: 190 }),
        querySelector: (sel) => (sel === ".wheel-inner" ? inner : null),
      };
    },
    get innerHTML() { return this._html; },
    querySelector(sel) { return sel === "svg" ? this.svg : null; },
  };
  return container;
}

const els = {};
let loadError = null;

beforeAll(async () => {
  for (const id of ["title", "alphabet", "readout", "error", "count", "reset", "download"]) {
    els[id] = makeEl(id);
  }
  els.sim = makeSimContainer();
  globalThis.lastWin = null;
  globalThis.window = {
    open: () =>
      (globalThis.lastWin = {
        location: "",
        closed: false,
        close() { this.closed = true; },
        document: { write() {} },
      }),
  };
  globalThis.document = {
    querySelector: (sel) => els[sel.replace(/^#/, "")] || null,
  };
  URL.createObjectURL ||= () => "blob:fake";
  URL.revokeObjectURL ||= () => {};
  globalThis.location = { hash: "", pathname: "/" };
  globalThis.history = { replaceState() {} };
  // rAF that finishes any animation in a single frame (t far past duration).
  globalThis.requestAnimationFrame = (cb) => (cb(performance.now() + 10_000), 1);
  globalThis.cancelAnimationFrame = () => {};
  try {
    await import("../src/main.js");
  } catch (err) {
    loadError = err;
  }
});

test("main.js loads without crashing (controls stay wired)", () => {
  expect(loadError).toBeNull();
  expect(els.sim.innerHTML).toContain("<svg");
  expect(els.title.listeners.input?.length).toBe(1);
  expect(els.alphabet.listeners.input?.length).toBe(1);
});

test("defaults land in the inputs and the readout", () => {
  expect(els.title.value).toBe("Cipher Disk");
  expect(els.alphabet.value).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  expect(els.count.textContent).toBe("26 symbols");
  expect(els.readout.textContent).toStartWith("shift 0");
});

test("typing a new alphabet re-renders the simulation", () => {
  els.alphabet.value = "ABCDE";
  els.alphabet.fire("input");
  // 5 letters × 2 rings + 5 numbers + 5 shift numbers + title + credit.
  expect(els.sim.innerHTML.split("<text").length - 1).toBe(5 * 4 + 2);
  expect(els.count.textContent).toBe("5 symbols");
});

test("typing a new title re-renders the simulation", () => {
  els.title.value = "OJ Ring";
  els.title.fire("input");
  expect(els.sim.innerHTML).toContain("OJ Ring");
});

test("dragging rotates the top disc and updates the readout", () => {
  els.alphabet.value = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  els.alphabet.fire("input");
  const svg = els.sim.svg;
  // Drag from 12 o'clock to 3 o'clock (a quarter turn ≈ shift 7 of 26).
  svg.fire("pointerdown", { clientX: 95, clientY: 20, pointerId: 1 });
  svg.fire("pointermove", { clientX: 170, clientY: 95, pointerId: 1 });
  svg.fire("pointerup", { pointerId: 1 });
  const deg = parseFloat(els.sim.inner.attrs.transform.match(/rotate\(([-\d.]+)\)/)[1]);
  expect(Math.abs(deg - 7 * (360 / 26))).toBeLessThan(0.01); // snapped to the grid
  expect(els.readout.textContent).toStartWith("shift 7");
});

test("open-PDF click builds a real PDF into a new window", async () => {
  els.title.value = "My Wheel";
  els.title.fire("input");
  await els.download.listeners.click[0]();
  expect(els.error.hidden).toBe(true);
  expect(globalThis.lastWin).not.toBeNull();
  expect(String(globalThis.lastWin.location)).toStartWith("blob:");
  expect(globalThis.lastWin.closed).toBe(false);
});

test("open-PDF click closes the window and surfaces unprintable-glyph errors", async () => {
  els.alphabet.value = "ΑΒΓΔΕ"; // Greek — WinAnsi can't print it
  els.alphabet.fire("input"); // the sim itself is fine with it
  await els.download.listeners.click[0]();
  expect(els.error.hidden).toBe(false);
  expect(els.error.textContent).toContain("can't print");
  expect(globalThis.lastWin.closed).toBe(true); // no orphaned blank tab
});

test("a blocked popup is reported, not silently swallowed", async () => {
  const realOpen = globalThis.window.open;
  globalThis.window.open = () => null;
  els.alphabet.value = "ABCDE";
  els.alphabet.fire("input");
  await els.download.listeners.click[0]();
  expect(els.error.hidden).toBe(false);
  expect(els.error.textContent).toContain("Popup blocked");
  globalThis.window.open = realOpen;
});
