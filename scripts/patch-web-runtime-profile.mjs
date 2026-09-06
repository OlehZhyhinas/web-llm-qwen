import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../node_modules/@mlc-ai/web-runtime/lib/index.js", import.meta.url);
let source = await readFile(path, "utf8");

function patch(needle, replacement) {
  if (source.includes(replacement)) return;
  if (!source.includes(needle)) throw new Error(`runtime patch point not found: ${needle.slice(0, 80)}`);
  source = source.replace(needle, replacement);
}

patch(
`                if (adapter.features.has("subgroups")) {
                    requiredFeatures.push("subgroups");
                }`,
`                if (adapter.features.has("subgroups")) {
                    requiredFeatures.push("subgroups");
                }
                if (globalThis.__tvmjsWebGPUProfile === true &&
                    adapter.features.has("timestamp-query")) {
                    requiredFeatures.push("timestamp-query");
                }`
);

patch(
`                    requiredFeatures
                });
                return {`,
`                    requiredFeatures
                });
                device.addEventListener("uncapturederror", (event) => {
                    console.error("[tvmjs-gpu]", event.error.message);
                });
                return {`
);

patch(
`            this.pendingDispatchCount = 0;
            // flags for debugging`,
`            this.pendingDispatchCount = 0;
            this.profileEnabled = false;
            this.profileEntries = [];
            this.profileRows = [];
            this.profileBatchIndex = 0;
            this.profilePendingReads = [];
            this.profileMaxQueries = 4096;
            // flags for debugging`
);

patch(
`            this.memory = memory;
            this.device = device;
        }`,
`            this.memory = memory;
            this.device = device;
            this.profileEnabled = globalThis.__tvmjsWebGPUProfile === true &&
                device.features.has("timestamp-query");
            if (this.profileEnabled) {
                this.profileQuerySet = device.createQuerySet({
                    type: "timestamp", count: this.profileMaxQueries,
                });
            }
        }`
);

patch(
`        flushCommands() {
            if (this.pendingEncoder) {
                this.device.queue.submit([this.pendingEncoder.finish()]);
                this.pendingEncoder = null;
                this.pendingDispatchCount = 0;
                this.pendingGPUToCPUCopyIsQueueTail = false;
            }
        }`,
`        flushCommands() {
            if (this.pendingEncoder) {
                const entries = this.profileEntries;
                const count = entries.length * 2;
                const batch = this.profileBatchIndex++;
                if (count && this.profileQuerySet) {
                    const resolveBuffer = this.device.createBuffer({
                        size: count * 8,
                        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
                    });
                    const readBuffer = this.device.createBuffer({
                        size: count * 8,
                        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                    });
                    this.pendingEncoder.resolveQuerySet(
                        this.profileQuerySet, 0, count, resolveBuffer, 0);
                    this.pendingEncoder.copyBufferToBuffer(
                        resolveBuffer, 0, readBuffer, 0, count * 8);
                    this.device.queue.submit([this.pendingEncoder.finish()]);
                    const pending = readBuffer.mapAsync(
                        GPUMapMode.READ, 0, count * 8).then(() => {
                        const stamps = new BigUint64Array(
                            readBuffer.getMappedRange(0, count * 8).slice(0));
                        for (const entry of entries) {
                            this.profileRows.push({
                                name: entry.name,
                                ns: Number(stamps[entry.end] - stamps[entry.begin]),
                                batch,
                            });
                        }
                        readBuffer.unmap();
                        resolveBuffer.destroy();
                        readBuffer.destroy();
                        globalThis.__tvmjsWebGPUProfileRows = this.profileRows;
                    });
                    this.profilePendingReads.push(pending);
                } else {
                    this.device.queue.submit([this.pendingEncoder.finish()]);
                }
                this.pendingEncoder = null;
                this.pendingDispatchCount = 0;
                this.profileEntries = [];
                this.pendingGPUToCPUCopyIsQueueTail = false;
            }
        }`
);

patch(
`                }
            });
        }
        /**
         * Obtain the runtime information`,
`                }
                if (this.profilePendingReads.length) {
                    const pendingProfiles = this.profilePendingReads;
                    this.profilePendingReads = [];
                    yield Promise.all(pendingProfiles);
                }
            });
        }
        /**
         * Obtain the runtime information`
);

patch(
`        createShader(finfo, code) {
            return this.createShadeInternal(finfo, code, false);
        }`,
`        createShader(finfo, code) {
            (globalThis.__tvmjsWebGPUShaders ??= []).push({
                name: finfo.name, code,
            });
            return this.createShadeInternal(finfo, code, false);
        }`
);

patch(
`        createShaderAsync(finfo, code) {
            return __awaiter(this, void 0, void 0, function* () {
                return yield this.createShadeInternal(finfo, code, true);
            });
        }`,
`        createShaderAsync(finfo, code) {
            (globalThis.__tvmjsWebGPUShaders ??= []).push({
                name: finfo.name, code,
            });
            return __awaiter(this, void 0, void 0, function* () {
                return yield this.createShadeInternal(finfo, code, true);
            });
        }`
);

patch(
`                    const compute = this.pendingEncoder.beginComputePass();
                    compute.setPipeline(pipeline);`,
`                    let compute;
                    if (this.profileEnabled && this.profileQuerySet &&
                        this.profileEntries.length * 2 + 1 < this.profileMaxQueries) {
                        const begin = this.profileEntries.length * 2;
                        const end = begin + 1;
                        this.profileEntries.push({ name: finfo.name, begin, end });
                        compute = this.pendingEncoder.beginComputePass({
                            label: finfo.name,
                            timestampWrites: {
                                querySet: this.profileQuerySet,
                                beginningOfPassWriteIndex: begin,
                                endOfPassWriteIndex: end,
                            },
                        });
                    } else {
                        compute = this.pendingEncoder.beginComputePass({ label: finfo.name });
                    }
                    compute.setPipeline(pipeline);`
);

await writeFile(path, source);
console.log(`patched ${path.pathname}`);
