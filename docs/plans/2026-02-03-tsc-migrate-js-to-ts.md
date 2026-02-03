# JS -> TS (tsc) Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert this MV3 Chrome extension's source from plain `.js` to `.ts`, compiling with `tsc` into a loadable unpacked extension folder.

**Architecture:** Keep extension runtime as classic scripts (no ESM). Move sources to `src/*.ts`, compile to `dist/extension/*.js`, and copy static assets (`manifest.json`, `popup.html`, `_locales/`, etc.) into `dist/extension/`.

**Tech Stack:** TypeScript (`tsc`), Node for scripts and tests (`node --test`).

---

## Notes / Constraints

- This repo currently has a broken Homebrew `node` (`/opt/homebrew/bin/node`) due to missing ICU dylibs. Use the NVM Node explicitly in commands:
  - `PATH=/Users/pipi/.nvm/versions/node/v23.11.0/bin:$PATH node ...`
  - `PATH=/Users/pipi/.nvm/versions/node/v23.11.0/bin:$PATH npm ...`
- Keep `manifest.json` semantics unchanged (MV3 service worker + content scripts + popup).
- Keep runtime compatible with Chrome extension "classic script" loading:
  - No `import` / `export` in built outputs.
  - No `type="module"` in `popup.html`.

---

### Task 1: Add TS build tooling (package + tsconfig)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

**Step 1: Create `package.json` with minimal scripts**

Create `package.json`:
```json
{
  "name": "x-copy-md",
  "private": true,
  "scripts": {
    "build": "npm run build:ts && npm run build:static",
    "build:ts": "tsc -p tsconfig.json",
    "build:static": "node scripts/copy-static.mjs",
    "test": "node --test"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

**Step 2: Create `tsconfig.json` compiling `src` -> `dist/extension`**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ES2020",
    "moduleResolution": "Bundler",
    "rootDir": "src",
    "outDir": "dist/extension",
    "strict": false,
    "skipLibCheck": true,
    "noEmitOnError": true
  },
  "include": ["src/**/*.ts"]
}
```

**Step 3: Install dev deps**

Run:
```bash
PATH=/Users/pipi/.nvm/versions/node/v23.11.0/bin:$PATH npm install
```
Expected: `typescript` installed, no errors.

**Step 4: Commit**

```bash
git add package.json tsconfig.json
git commit -m "chore: add typescript build scaffolding"
```

---

### Task 2: Add static asset copy script (build output is loadable)

**Files:**
- Create: `scripts/copy-static.mjs`

**Step 1: Implement minimal copy script**

Create `scripts/copy-static.mjs`:
```js
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
```

**Step 2: Run build once (expected to fail until TS sources exist)**

Run:
```bash
PATH=/Users/pipi/.nvm/versions/node/v23.11.0/bin:$PATH npm run build
```
Expected: FAIL from `tsc` complaining `src/` missing. (This is fine for this step.)

**Step 3: Commit**

```bash
git add scripts/copy-static.mjs
git commit -m "chore: add static asset copy for dist extension"
```

---

### Task 3: Create TS globals/shims for Chrome extension runtime

**Files:**
- Create: `src/global.d.ts`

**Step 1: Add minimal ambient types**

Create `src/global.d.ts`:
```ts
// Minimal shims: we avoid adding external type deps for now.
declare const chrome: any;
declare function importScripts(...urls: string[]): void;

declare global {
  // Runtime global used by content scripts + background worker.
  // Kept as `any` until we decide to add stronger types.
  // eslint-disable-next-line no-var
  var XCopyMd: any;
}

export {};
```

**Step 2: Commit**

```bash
git add src/global.d.ts
git commit -m "chore: add minimal TS shims for chrome/importScripts globals"
```

---

### Task 4: Migrate `format.js` -> `src/format.ts` and keep tests passing

**Files:**
- Create: `src/format.ts`
- Modify: `format.test.js`

**Step 1: Update tests to import the built `format.js`**

Modify `format.test.js` to require from `dist/extension/format.js`:
```js
} = require("./dist/extension/format");
```

**Step 2: Run tests (expected FAIL because build output doesn't exist yet)**

Run:
```bash
PATH=/Users/pipi/.nvm/versions/node/v23.11.0/bin:$PATH node --test format.test.js
```
Expected: FAIL with "Cannot find module './dist/extension/format'".

**Step 3: Create `src/format.ts` by porting `format.js`**

Create `src/format.ts`:
- Keep function bodies identical (copy/paste) but add lightweight TS typing where obvious:
  - `parseTweetUrl(input: unknown): { username: string; id: string; url: string } | null`
  - `inferImageExt(url: unknown): string`
  - etc.
- Preserve Node test compatibility via `module.exports` conditional (same behavior as today).
- Preserve browser runtime via `globalThis.XCopyMd = { ... }` assignment.

**Step 4: Build then run tests (expected PASS)**

Run:
```bash
PATH=/Users/pipi/.nvm/versions/node/v23.11.0/bin:$PATH npm run build
PATH=/Users/pipi/.nvm/versions/node/v23.11.0/bin:$PATH node --test format.test.js
```
Expected: tests PASS.

**Step 5: Commit**

```bash
git add src/format.ts format.test.js
git commit -m "refactor: port format helpers to typescript"
```

---

### Task 5: Migrate extension scripts (`background`, `popup`, `content`)

**Files:**
- Create: `src/background.ts`
- Create: `src/popup.ts`
- Create: `src/content.ts`
- Delete (optional, after validating): `background.js`, `popup.js`, `content.js`, `format.js`

**Step 1: Port each file as-is (no behavior changes)**

- `src/background.ts`: keep `importScripts("format.js")` and all runtime logic unchanged.
- `src/popup.ts`: keep DOM queries and chrome.storage usage unchanged.
- `src/content.ts`: keep DOM parsing logic unchanged.

**Step 2: Build (expected PASS)**

Run:
```bash
PATH=/Users/pipi/.nvm/versions/node/v23.11.0/bin:$PATH npm run build
```
Expected: `dist/extension/background.js`, `dist/extension/popup.js`, `dist/extension/content.js`, `dist/extension/format.js` exist.

**Step 3: Manual smoke test in Chrome**

- Open `chrome://extensions`
- Enable Developer mode
- Click "Load unpacked"
- Select `dist/extension/`
- Visit `https://x.com/` and try:
  - Right click tweet -> "Copy tweet as Markdown"
  - Toggle popup options, ensure they persist

**Step 4: Delete root `.js` sources only after smoke test**

Delete root JS sources (so TS becomes the source of truth):
```bash
git rm background.js popup.js content.js format.js
```

**Step 5: Rebuild + re-run tests**

Run:
```bash
PATH=/Users/pipi/.nvm/versions/node/v23.11.0/bin:$PATH npm run build
PATH=/Users/pipi/.nvm/versions/node/v23.11.0/bin:$PATH node --test format.test.js
```
Expected: PASS.

**Step 6: Commit**

```bash
git add src/background.ts src/popup.ts src/content.ts
git commit -m "refactor: port extension scripts to typescript"
```

---

### Task 6: Update docs for new build output

**Files:**
- Modify: `README.md`

**Step 1: Update install instructions**

Change "Select the `x-copy-md/` folder" to "Select `dist/extension/` after `npm run build`".

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: load unpacked extension from dist/extension"
```

