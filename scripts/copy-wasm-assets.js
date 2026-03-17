import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const srcDir = path.join(root, "node_modules", "@chriskoch", "cpp-wasm");
const outDir = path.join(root, "public", "wasm");
const files = ["clang", "lld", "memfs", "sysroot.tar"];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(srcDir))) {
    console.warn("cpp-wasm not installed; skipping asset copy.");
    return;
  }
  await fs.mkdir(outDir, { recursive: true });
  for (const f of files) {
    const src = path.join(srcDir, f);
    const dst = path.join(outDir, f);
    if (!(await exists(src))) {
      console.warn(`Missing ${src}, skipping.`);
      continue;
    }
    await fs.copyFile(src, dst);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
