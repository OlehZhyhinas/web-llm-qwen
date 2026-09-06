// Apply every runtime patch in order and prove the installed
// @mlc-ai/web-runtime carries each one. Run this after any `npm install`
// (or anything that may run it, such as the husky pre-commit hook), and
// before `npm run build`: a reinstall silently restores the pristine runtime,
// and a bundle built from it ignores every flag the harness sets.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patches = [
  ["patch-web-runtime-profile.mjs", "__tvmjsWebGPUProfile"],
  ["patch-web-runtime-batch-pass.mjs", "__tvmjsWebGPUBatchPass"],
  ["patch-web-runtime-flush-every.mjs", "__tvmjsWebGPUFlushEvery"],
  ["patch-web-runtime-bind-cache.mjs", "__tvmjsWebGPUBindGroupCache"],
  ["patch-web-runtime-readback-tail.mjs", "__tvmjsWebGPUReadbackTail"],
];
const runtimeFile = new URL("../node_modules/@mlc-ai/web-runtime/lib/index.js", import.meta.url);
for (const [script, marker] of patches) {
  if (readFileSync(runtimeFile, "utf8").includes(marker)) {
    console.log(script, "already applied");
    continue;
  }
  execFileSync(process.execPath, [new URL(script, import.meta.url).pathname], { stdio: "inherit" });
}
const runtime = readFileSync(runtimeFile, "utf8");
const missing = patches.filter(([, marker]) => !runtime.includes(marker)).map(([s]) => s);
if (missing.length) {
  throw new Error("runtime is missing patches: " + missing.join(", "));
}
console.log("all runtime patches present");
