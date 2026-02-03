# Content Script (content.ts) Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Refactor `src/content.ts` to be readable and maintainable, while preserving current behavior, and fix the current scope bug around `lastPointer` / `lastContextMenuTarget`.

**Architecture:** Keep a single-file content script (no new runtime modules, no `manifest.json` changes). Wrap all logic in one top-level IIFE and organize the file into small cohesive sections: state/settings, DOM/X heuristics, markdown extraction, clipboard/toast utilities, and event/message entrypoints. Fix the scope bug by ensuring all event listeners reference the same closure state.

**Tech Stack:** TypeScript compiled via `tsc` to MV3 classic scripts (`dist/extension/content.js`), Chrome extension APIs (`chrome.runtime`, `chrome.storage`).

---

## Preconditions / Current Blocker

On this machine, `node` is currently broken:

- Running `node -v` / `npm test` aborts with a `dyld` error about missing ICU dylibs (e.g. `libicui18n.72.dylib`).

This plan still describes the correct verification commands, but until Node is fixed, those steps will fail before reaching TypeScript/tests.

---

### Task 1: Snapshot current behavior + identify invariants

**Files:**
- Review: `src/content.ts`
- Review: `manifest.json`

**Step 1: Identify invariants to preserve**
- Context-menu copy path still uses `chrome.runtime.onMessage` with `X_COPY_MD_COPY_TWEET`.
- Auto copy (`Ctrl/Cmd+C` with no selection) still works when `settings.autoMarkdownCopy === true`.
- `settings` still comes from `chrome.storage.sync` with defaults `{ autoMarkdownCopy: false, useLocalImages: true }`.
- Still relies on `globalThis.XCopyMd.*` helpers from `format.js` (loaded before `content.js`).

**Step 2: Document the known bug (to be fixed)**
- `lastPointer` / `lastContextMenuTarget` are defined inside an IIFE, but referenced by event handlers outside that IIFE, which can throw at runtime.

---

### Task 2: Create a single script-scope IIFE and a shared state object

**Files:**
- Modify: `src/content.ts`

**Step 1: Introduce a single top-level IIFE**
Create a single wrapper so everything shares scope and doesn’t leak globals:

```ts
// Content script: captures right-click location, extracts tweet/article data, writes Markdown to clipboard.
(() => {
  // ...everything lives here...
})();
```

**Step 2: Create a shared state object**
Replace scattered `let`s with a cohesive state:

```ts
type PointerState = { x: number | null; y: number | null; target: EventTarget | null };

const state = {
  settings: { ...SETTINGS_DEFAULTS },
  lastContextMenuTarget: null as EventTarget | null,
  lastPointer: { x: null, y: null, target: null } as PointerState
};
```

Expected effect: fixes the current scope bug by construction (listeners and handlers reference `state.*` in the same closure).

---

### Task 3: Refactor settings loading + syncing (no behavior change)

**Files:**
- Modify: `src/content.ts`

**Step 1: Move `SETTINGS_DEFAULTS`, `loadSettings`, and storage listener together**
Keep logic identical, but rewrite to read/write `state.settings` only:

```ts
const SETTINGS_DEFAULTS = { autoMarkdownCopy: false, useLocalImages: true };

function loadSettings(): void {
  try {
    chrome.storage?.sync?.get(SETTINGS_DEFAULTS, (res) => {
      if (chrome.runtime.lastError) return;
      state.settings = { ...state.settings, ...res };
    });
  } catch {
    // ignore
  }
}

function installSettingsSync(): void {
  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== "sync") return;
      for (const [k, v] of Object.entries(changes || {})) {
        // @ts-expect-error runtime settings bag
        state.settings[k] = v?.newValue;
      }
    });
  } catch {
    // ignore
  }
}
```

**Step 2: Call initialization once**

```ts
installSettingsSync();
loadSettings();
```

---

### Task 4: Consolidate pointer/context tracking listeners (bug fix)

**Files:**
- Modify: `src/content.ts`

**Step 1: Create small helpers**

```ts
function setLastPointer(e: MouseEvent | PointerEvent): void {
  state.lastPointer = { x: e.clientX, y: e.clientY, target: e.target };
}
```

**Step 2: Register listeners inside the IIFE**
No behavior change, just consistent state:

```ts
document.addEventListener("contextmenu", (e) => {
  state.lastContextMenuTarget = e.target;
}, true);

document.addEventListener("mousemove", setLastPointer, true);
document.addEventListener("pointerdown", setLastPointer, true);
```

---

### Task 5: Reorder and group the pure helper functions (readability-only)

**Files:**
- Modify: `src/content.ts`

**Step 1: Group sections with headers**
Keep implementations the same, but move into these blocks (no functional edits unless needed):

- `// -------------------- DOM helpers (X/Twitter heuristics)`
- `// -------------------- Markdown extraction helpers`
- `// -------------------- X Article extraction`
- `// -------------------- Chrome messaging + clipboard`
- `// -------------------- UI toast`
- `// -------------------- Copy flows`
- `// -------------------- Entrypoints (runtime message + keydown)`

**Step 2: Minimal mechanical changes**
- Replace references of `settings.*` with `state.settings.*`.
- Replace `lastPointer` / `lastContextMenuTarget` with `state.lastPointer` / `state.lastContextMenuTarget`.
- Keep all regexes/heuristics the same.

---

### Task 6: Make entrypoints explicit (no behavior change)

**Files:**
- Modify: `src/content.ts`

**Step 1: Extract entrypoint functions**

```ts
async function handleCopyRequestFromRuntime(): Promise<void> { /* existing onMessage flow */ }
function handleAutoCopyKeydown(e: KeyboardEvent): void { /* existing keydown flow */ }
```

**Step 2: Wire them**

```ts
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "X_COPY_MD_COPY_TWEET") return;
  handleCopyRequestFromRuntime().catch((err) => toast(`Copy failed: ${err?.message || String(err)}`));
});

document.addEventListener("keydown", handleAutoCopyKeydown, true);
```

---

### Task 7: Verification (build + tests)

**Files:**
- None (commands only)

**Step 1: Run unit tests and build**
Run (from repo root or worktree):
- `npm test`

Expected: PASS (but currently blocked by Node dyld/ICU issue on this machine).

**Step 2: Smoke checks (manual)**
- Load unpacked extension from `dist/extension/`.
- On `https://x.com/...`:
  - Right-click on a tweet -> trigger copy -> “Copied” toast.
  - Enable “Auto Markdown Copy” in popup and press `Cmd/Ctrl+C` with no selection -> it copies tweet markdown.
  - Try a quoted tweet: ensure main + quoted content behavior unchanged.
  - Try an X Article page: `copyXArticleAsMarkdownFromDocument` path still works.

---

### Task 8: Commit

**Files:**
- Modify: `src/content.ts`
- Add: `docs/plans/2026-02-03-content-ts-refactor.md`

**Step 1: Stage**
```bash
git add src/content.ts docs/plans/2026-02-03-content-ts-refactor.md
```

**Step 2: Commit**
```bash
git commit -m "refactor: reorganize content script and fix pointer state scope"
```

