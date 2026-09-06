// Patch the installed @mlc-ai/web-runtime so every GPU->CPU readback publishes
// the promise chain it joined (globalThis.__tvmjsWebGPUReadbackTail). A caller
// that issued readbacks can then await exactly those copies while later GPU
// work stays queued, instead of device.sync(), which drains the whole queue.
// Always on; a global assignment per readback is the entire cost. Idempotent.
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../node_modules/@mlc-ai/web-runtime/lib/index.js", import.meta.url);
let src = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const before = src;

function replaceOnce(needle, replacement) {
  const first = src.indexOf(needle);
  if (first < 0) throw new Error("needle not found: " + needle.slice(0, 80));
  if (src.indexOf(needle, first + 1) >= 0) throw new Error("needle not unique: " + needle.slice(0, 80));
  src = src.slice(0, first) + replacement + src.slice(first + needle.length);
}

// Each readback is chained as prev.then(() => readPromise). If prev rejects
// (device destroyed with maps pending) the callback never runs and readPromise
// is never observed, which surfaces as an unhandled rejection per orphaned
// readback. Observing it here changes nothing about what sync() sees.
if (!src.includes("readPromise.catch(() => undefined)")) {
  replaceOnce(
    "            // Chain with any existing pending read so sync() awaits all of them.\n",
    "            readPromise.catch(() => undefined);\n" +
    "            // Chain with any existing pending read so sync() awaits all of them.\n",
  );
}
if (!src.includes("__tvmjsWebGPUReadbackTail")) replaceOnce(
  "            this.pendingGPUToCPUCopy = this.pendingGPUToCPUCopy\n" +
  "                ? this.pendingGPUToCPUCopy.then(() => readPromise)\n" +
  "                : readPromise;\n",
  "            this.pendingGPUToCPUCopy = this.pendingGPUToCPUCopy\n" +
  "                ? this.pendingGPUToCPUCopy.then(() => readPromise)\n" +
  "                : readPromise;\n" +
  "            // Expose the chain so a caller can await its own readbacks without a full sync.\n" +
  "            globalThis.__tvmjsWebGPUReadbackTail = this.pendingGPUToCPUCopy;\n",
);

if (src === before) {
  console.log("already patched");
  process.exit(0);
}
writeFileSync(file, src);
console.log("patched", file.pathname);
