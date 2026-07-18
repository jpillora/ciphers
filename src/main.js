// Page wiring: controls ↔ simulation ↔ PDF download ↔ shareable #hash state.

import { DEFAULT_ALPHABET, DEFAULT_TITLE, buildRingPdf, normalizeAlphabet } from "./ring.js";
import { mountSim } from "./sim.js";

const $ = (sel) => document.querySelector(sel);
const titleInput = $("#title");
const alphabetInput = $("#alphabet");
const readout = $("#readout");
const errorBox = $("#error");

// --- state from the URL hash (#t=…&a=…&s=…), so wheels are shareable ---
const hash = new URLSearchParams(location.hash.slice(1));
titleInput.value = hash.get("t") || DEFAULT_TITLE;
alphabetInput.value = hash.get("a") || DEFAULT_ALPHABET;

const writeHash = () => {
  const p = new URLSearchParams();
  if (titleInput.value !== DEFAULT_TITLE) p.set("t", titleInput.value);
  if (alphabetInput.value !== DEFAULT_ALPHABET) p.set("a", alphabetInput.value);
  if (sim.shift()) p.set("s", String(sim.shift()));
  history.replaceState(null, "", p.size ? `#${p}` : location.pathname);
};

const updateReadout = (k) => {
  const g = normalizeAlphabet(alphabetInput.value);
  readout.textContent = `shift ${k} — ${g[0]} → ${g[k % g.length]}`;
  writeHash();
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
