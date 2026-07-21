// Shared, testable helpers for keyboard shortcut behavior.
// Keep this file "script-style" (no ESM imports/exports) so compiled output works
// as classic extension scripts and can still be `require()`'d by Node tests.

(() => {
  type ShortcutAction = "copy" | "save";

  function resolveShortcutAction(_args?: {
    autoMarkdownCopy?: unknown;
    defaultSaveMarkdownFile?: unknown;
    ctrlKey?: unknown;
    metaKey?: unknown;
    altKey?: unknown;
    key?: unknown;
    hasSelection?: unknown;
    isEditable?: unknown;
  }): ShortcutAction | null {
    if (!_args || !Boolean(_args.autoMarkdownCopy)) return null;
    if (Boolean(_args.altKey)) return null;
    if (Boolean(_args.isEditable)) return null;

    const key = String(_args.key ?? "");
    if (!key) return null;
    const hasMod = Boolean(_args.ctrlKey) || Boolean(_args.metaKey);
    if (!hasMod) return null;

    const defaultSaveMarkdownFile = Boolean(_args.defaultSaveMarkdownFile);
    if (defaultSaveMarkdownFile) return key === "s" || key === "S" ? "save" : null;
    if (Boolean(_args.hasSelection)) return null; // preserve default copy selection behavior
    return key === "c" || key === "C" ? "copy" : null;
  }

  // Exports for Node tests.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      resolveShortcutAction
    };
  }

  // Globals for content scripts.
  if (typeof globalThis !== "undefined") {
    globalThis.XCopyMdShortcut = {
      resolveShortcutAction
    };
  }
})();
