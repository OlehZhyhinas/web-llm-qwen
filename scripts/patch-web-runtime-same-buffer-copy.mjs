// Patch the installed @mlc-ai/web-runtime so a GPU->GPU copy whose source and
// destination live in the same GPUBuffer goes through a staging buffer.
// WebGPU rejects copyBufferToBuffer with identical buffers, which invalidates
// the whole command buffer; TVM's RNNState::ForkSequence copies one sequence
// slot to another inside a single storage tensor and hits exactly that. The
// staging buffer is kept and grown on demand. Idempotent.
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

if (!src.includes("__tvmjsWebGPUSameBufferCopy")) replaceOnce(
  "            this.endPendingPass();\n" +
  "            this.pendingEncoder.copyBufferToBuffer(this.gpuBufferFromPtr(from), fromOffset, this.gpuBufferFromPtr(to), toOffset, nbytes);\n" +
  "        }\n",
  "            this.endPendingPass();\n" +
  "            const fromBuffer = this.gpuBufferFromPtr(from);\n" +
  "            const toBuffer = this.gpuBufferFromPtr(to);\n" +
  "            if (fromBuffer === toBuffer) {\n" +
  "                // WebGPU forbids a copy within one buffer; stage it through a\n" +
  "                // scratch buffer that is kept and grown as needed.\n" +
  "                globalThis.__tvmjsWebGPUSameBufferCopy = (globalThis.__tvmjsWebGPUSameBufferCopy ?? 0) + 1;\n" +
  "                if (!this.sameBufferCopyStaging || this.sameBufferCopyStaging.size < nbytes) {\n" +
  "                    this.sameBufferCopyStaging?.destroy();\n" +
  "                    this.sameBufferCopyStaging = this.device.createBuffer({\n" +
  "                        size: Math.max(nbytes, 1 << 20),\n" +
  "                        usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,\n" +
  "                    });\n" +
  "                }\n" +
  "                this.pendingEncoder.copyBufferToBuffer(fromBuffer, fromOffset, this.sameBufferCopyStaging, 0, nbytes);\n" +
  "                this.pendingEncoder.copyBufferToBuffer(this.sameBufferCopyStaging, 0, toBuffer, toOffset, nbytes);\n" +
  "                return;\n" +
  "            }\n" +
  "            this.pendingEncoder.copyBufferToBuffer(fromBuffer, fromOffset, toBuffer, toOffset, nbytes);\n" +
  "        }\n",
);

if (src === before) {
  console.log("already patched");
  process.exit(0);
}
writeFileSync(file, src);
console.log("patched", file.pathname);
