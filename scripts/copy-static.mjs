import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("dist/extension");

async function ensureDir(p) {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

async function copy(from, to = from) {
  await cp(from, path.join(OUT, to), { recursive: true });
}

await ensureDir(OUT);
await copy("manifest.json");
await copy("popup.html");
await copy("popup.css");
await copy("icon128.png");
await copy("_locales");

