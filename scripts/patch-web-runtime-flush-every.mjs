// Patch the installed @mlc-ai/web-runtime to submit the pending command
// encoder every N dispatches (globalThis.__tvmjsWebGPUFlushEvery = N), so the
// GPU starts executing while JS is still encoding the rest of the step,
// instead of only at the next sync/readback. 0/unset keeps the old behaviour.
// Applies on top of patch-web-runtime-batch-pass.mjs. Idempotent.
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../node_modules/@mlc-ai/web-runtime/lib/index.js", import.meta.url);
let src = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
if (src.includes("__tvmjsWebGPUFlushEvery")) {
  console.log("already patched");
  process.exit(0);
}
if (!src.includes("__tvmjsWebGPUBatchPass")) {
  throw new Error("apply patch-web-runtime-batch-pass.mjs first");
}

function replaceOnce(needle, replacement) {
  const first = src.indexOf(needle);
  if (first < 0) throw new Error("needle not found: " + needle.slice(0, 80));
  if (src.indexOf(needle, first + 1) >= 0) throw new Error("needle not unique: " + needle.slice(0, 80));
  src = src.slice(0, first) + replacement + src.slice(first + needle.length);
}

replaceOnce(
  "            this.batchPass = globalThis.__tvmjsWebGPUBatchPass === true && !this.profileEnabled;\n",
  "            this.batchPass = globalThis.__tvmjsWebGPUBatchPass === true && !this.profileEnabled;\n" +
  "            // Submit after this many dispatches (0 = only at sync/readback).\n" +
  "            this.flushEvery = Number(globalThis.__tvmjsWebGPUFlushEvery) > 0 ? Number(globalThis.__tvmjsWebGPUFlushEvery) : 0;\n",
);
replaceOnce(
  "                    if (compute !== this.pendingPass) {\n                        compute.end();\n                    }\n",
  "                    if (compute !== this.pendingPass) {\n                        compute.end();\n                    }\n" +
  "                    if (this.flushEvery > 0 && this.pendingDispatchCount >= this.flushEvery) {\n" +
  "                        this.flushCommands();\n" +
  "                    }\n",
);

writeFileSync(file, src);
console.log("patched", file.pathname);
