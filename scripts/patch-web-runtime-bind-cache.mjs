// Patch the installed @mlc-ai/web-runtime to reuse GPUBindGroup objects across
// dispatches of the same shader with the same buffers (keyed by GPUBuffer
// identity, not pointer, so freed/reused allocations cannot alias). Gated by
// globalThis.__tvmjsWebGPUBindGroupCache. Idempotent.
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../node_modules/@mlc-ai/web-runtime/lib/index.js", import.meta.url);
let src = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
if (src.includes("__tvmjsWebGPUBindGroupCache")) {
  console.log("already patched");
  process.exit(0);
}

function replaceOnce(needle, replacement) {
  const first = src.indexOf(needle);
  if (first < 0) throw new Error("needle not found: " + needle.slice(0, 80));
  if (src.indexOf(needle, first + 1) >= 0) throw new Error("needle not unique: " + needle.slice(0, 80));
  src = src.slice(0, first) + replacement + src.slice(first + needle.length);
}

replaceOnce(
  "            this.pendingPass = null;\n            this.batchPass = false;\n",
  "            this.pendingPass = null;\n            this.batchPass = false;\n" +
  "            this.bindGroupCacheEnabled = globalThis.__tvmjsWebGPUBindGroupCache === true;\n" +
  "            this.gpuBufferIds = new WeakMap();\n" +
  "            this.nextGpuBufferId = 1;\n",
);
replaceOnce(
  "            const bindGroupLayout = this.device.createBindGroupLayout({",
  "            const bindGroupCache = new Map();\n" +
  "            const bindGroupCacheMax = 4096;\n" +
  "            const bufferId = (buffer) => {\n" +
  "                let id = this.gpuBufferIds.get(buffer);\n" +
  "                if (id === undefined) {\n" +
  "                    id = this.nextGpuBufferId++;\n" +
  "                    this.gpuBufferIds.set(buffer, id);\n" +
  "                }\n" +
  "                return id;\n" +
  "            };\n" +
  "            const bindGroupLayout = this.device.createBindGroupLayout({",
);
replaceOnce(
  "                    compute.setBindGroup(0, this.device.createBindGroup({\n" +
  "                        layout: bindGroupLayout,\n" +
  "                        entries: bindGroupEntries\n" +
  "                    }));\n",
  "                    if (this.bindGroupCacheEnabled) {\n" +
  "                        let key = \"\";\n" +
  "                        for (const entry of bindGroupEntries) {\n" +
  "                            key += bufferId(entry.resource.buffer) + \",\";\n" +
  "                        }\n" +
  "                        key += i32View.buffer.byteLength;\n" +
  "                        let bindGroup = bindGroupCache.get(key);\n" +
  "                        if (bindGroup === undefined) {\n" +
  "                            bindGroup = this.device.createBindGroup({ layout: bindGroupLayout, entries: bindGroupEntries });\n" +
  "                            if (bindGroupCache.size >= bindGroupCacheMax) {\n" +
  "                                bindGroupCache.delete(bindGroupCache.keys().next().value);\n" +
  "                            }\n" +
  "                            bindGroupCache.set(key, bindGroup);\n" +
  "                        }\n" +
  "                        compute.setBindGroup(0, bindGroup);\n" +
  "                    } else {\n" +
  "                        compute.setBindGroup(0, this.device.createBindGroup({\n" +
  "                            layout: bindGroupLayout,\n" +
  "                            entries: bindGroupEntries\n" +
  "                        }));\n" +
  "                    }\n",
);

writeFileSync(file, src);
console.log("patched", file.pathname);
