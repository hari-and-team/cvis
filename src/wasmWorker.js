import { createWasmCompiler } from "./wasmCompiler";

let compiler = null;
let initPromise = null;

async function getCompiler(baseUrl) {
  if (compiler) return compiler;
  if (!initPromise) {
    const clang = `${baseUrl}clang`;
    const lld = `${baseUrl}lld`;
    const memfs = `${baseUrl}memfs`;
    const sysroot = `${baseUrl}sysroot.tar`;
    let output = "";
    initPromise = Promise.resolve().then(() => {
      compiler = createWasmCompiler({
        clang,
        lld,
        memfs,
        sysroot,
        onOutput: (str) => { output += str; },
      });
      compiler._getOutput = () => output;
      compiler._clearOutput = () => { output = ""; };
      return compiler;
    });
  }
  return initPromise;
}

self.onmessage = async (e) => {
  const data = e.data || {};
  const runId = data.runId;
  try {
    const baseUrl = data.baseUrl || "/wasm/";
    const code = data.code || "";
    const stdin = data.stdin || "";
    const c = await getCompiler(baseUrl);
    c._clearOutput();
    await c.compileLinkRun(code, { language: "c", stdin });
    const output = c._getOutput();
    self.postMessage({ runId, output });
  } catch (err) {
    const output = compiler && compiler._getOutput ? compiler._getOutput() : "";
    self.postMessage({
      runId,
      error: err && err.message ? err.message : "WASM compiler error",
      output,
    });
  }
};
