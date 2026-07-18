// Page wiring: controls ↔ simulation ↔ PDF download ↔ shareable #hash state.

import { DEFAULT_ALPHABET, DEFAULT_TITLE, buildRingPdf, normalizeAlphabet } from "./ring.js";
import { mountSim } from "./sim.js";

const $ = (sel) => document.querySelector(sel);
const titleInput = $("#title");
const alphabetInput = $("#alphabet");
const readout = $("#readout");
const errorBox = $("#error");
const countBadge = $("#count");

// --- state from the URL hash (#t=…&a=…&s=…), so wheels are shareable ---
const hash = new URLSearchParams(location.hash.slice(1));
titleInput.value = hash.get("t") || DEFAULT_TITLE;
alphabetInput.value = hash.get("a") || DEFAULT_ALPHABET;

// Debounced: onShift fires on every drag frame, and Safari throttles
// history.replaceState hard enough to throw.
let hashTimer = 0;
const writeHash = (k) => {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const p = new URLSearchParams();
    if (titleInput.value !== DEFAULT_TITLE) p.set("t", titleInput.value);
    if (alphabetInput.value !== DEFAULT_ALPHABET) p.set("a", alphabetInput.value);
    if (k) p.set("s", String(k));
    const q = p.toString();
    history.replaceState(null, "", q ? `#${q}` : location.pathname);
  }, 150);
};

// NOTE: called synchronously from inside mountSim(), before `sim` is assigned
// — must not touch `sim` (that exact TDZ crash once killed all the controls).
const updateReadout = (k) => {
  const g = normalizeAlphabet(alphabetInput.value);
  countBadge.textContent = `${g.length} symbols`;
  readout.textContent = `shift ${k} — ${g[0]} → ${g[k % g.length]}`;
  writeHash(k);
};

const sim = mountSim($("#sim"), { alphabet: alphabetInput.value, title: titleInput.value }, updateReadout);

const initialShift = parseInt(hash.get("s") || "0", 10);
if (initialShift) sim.setShift(initialShift);

// --- controls ---
const onChange = () => {
  errorBox.hidden = true;
  sim.update({ alphabet: alphabetInput.value, title: titleInput.value });
};
titleInput.addEventListener("input", onChange);
alphabetInput.addEventListener("input", onChange);

$("#reset").addEventListener("click", () => {
  titleInput.value = DEFAULT_TITLE;
  alphabetInput.value = DEFAULT_ALPHABET;
  onChange();
  sim.setShift(0);
});

$("#download").addEventListener("click", async () => {
  errorBox.hidden = true;
  try {
    const bytes = await buildRingPdf({ alphabet: alphabetInput.value, title: titleInput.value });
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(titleInput.value || DEFAULT_TITLE).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "decoder-ring"}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (err) {
    errorBox.textContent = String(err.message || err);
    errorBox.hidden = false;
  }
});
