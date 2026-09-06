// Patch the installed @mlc-ai/web-runtime to batch compute dispatches into a
// single GPUComputePassEncoder between flush points, gated behind
// globalThis.__tvmjsWebGPUBatchPass. Off by default; mutually exclusive with
// the timestamp-query profiler (timestampWrites are per pass). Idempotent.
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../node_modules/@mlc-ai/web-runtime/lib/index.js", import.meta.url);
let src = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
if (src.includes("__tvmjsWebGPUBatchPass")) {
  console.log("already patched");
  process.exit(0);
}

function replaceOnce(needle, replacement) {
  const first = src.indexOf(needle);
  if (first < 0) throw new Error("needle not found: " + needle.slice(0, 80));
  if (src.indexOf(needle, first + 1) >= 0) throw new Error("needle not unique: " + needle.slice(0, 80));
  src = src.slice(0, first) + replacement + src.slice(first + needle.length);
}

// State.
replaceOnce(
  "            this.pendingEncoder = null;\n            // Pool of uniform buffers",
  "            this.pendingEncoder = null;\n" +
  "            // Open compute pass shared by consecutive dispatches (batch-pass mode).\n" +
  "            this.pendingPass = null;\n" +
  "            this.batchPass = false;\n" +
  "            // Pool of uniform buffers",
);
replaceOnce(
  "                device.features.has(\"timestamp-query\");\n",
  "                device.features.has(\"timestamp-query\");\n" +
  "            this.batchPass = globalThis.__tvmjsWebGPUBatchPass === true && !this.profileEnabled;\n",
);

// End the shared pass before anything encoder-level (copies, resolve, finish).
replaceOnce(
  "        flushCommands() {\n            if (this.pendingEncoder) {\n",
  "        endPendingPass() {\n" +
  "            if (this.pendingPass) {\n" +
  "                this.pendingPass.end();\n" +
  "                this.pendingPass = null;\n" +
  "            }\n" +
  "        }\n" +
  "        flushCommands() {\n            if (this.pendingEncoder) {\n" +
  "                this.endPendingPass();\n",
);
replaceOnce(
  "            this.pendingEncoder.copyBufferToBuffer(this.gpuBufferFromPtr(from), fromOffset,",
  "            this.endPendingPass();\n" +
  "            this.pendingEncoder.copyBufferToBuffer(this.gpuBufferFromPtr(from), fromOffset,",
);

// Dispatch into the shared pass.
replaceOnce(
  "                    } else {\n                        compute = this.pendingEncoder.beginComputePass({ label: finfo.name });\n                    }\n",
  "                    } else if (this.batchPass) {\n" +
  "                        if (!this.pendingPass) {\n" +
  "                            this.pendingPass = this.pendingEncoder.beginComputePass({ label: \"tvmjs-batch\" });\n" +
  "                        }\n" +
  "                        compute = this.pendingPass;\n" +
  "                    }\n" +
  "                    else {\n                        compute = this.pendingEncoder.beginComputePass({ label: finfo.name });\n                    }\n",
);
replaceOnce(
  "                    compute.dispatchWorkgroups(workDim[0], workDim[1], workDim[2]);\n                    compute.end();\n",
  "                    compute.dispatchWorkgroups(workDim[0], workDim[1], workDim[2]);\n" +
  "                    if (compute !== this.pendingPass) {\n                        compute.end();\n                    }\n",
);

writeFileSync(file, src);
console.log("patched", file.pathname);
