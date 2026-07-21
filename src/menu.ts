// Shared, testable helpers for context menu behavior.
// Keep this file "script-style" (no ESM imports/exports) so compiled output works
// as classic extension scripts and can still be `require()`'d by Node tests.

(() => {
  type ContextMenuAction = "copy" | "save";
  type ContextMenuState = {
    primary: { action: ContextMenuAction; titleKey: string; fallbackTitle: string };
  };

  function getContextMenuState(_args?: { defaultSaveMarkdownFile?: unknown }): ContextMenuState {
    const defaultSaveMarkdownFile = Boolean(_args?.defaultSaveMarkdownFile);

    const copy = {
      action: "copy" as const,
      titleKey: "contextMenu_copyAsMarkdown",
      fallbackTitle: "Copy tweet as Markdown"
    };
    const save = {
      action: "save" as const,
      titleKey: "contextMenu_saveAsMarkdownFile",
      fallbackTitle: "Save tweet as .md (Downloads)"
    };

    return { primary: defaultSaveMarkdownFile ? save : copy };
  }

  function resolveContextMenuAction(_args?: {
    menuItemId?: unknown;
    defaultSaveMarkdownFile?: unknown;
    primaryId?: unknown;
  }): ContextMenuAction | null {
    const menuItemId = String(_args?.menuItemId ?? "");
    const primaryId = String(_args?.primaryId ?? "");
    if (!menuItemId || !primaryId) return null;

    const state = getContextMenuState({ defaultSaveMarkdownFile: _args?.defaultSaveMarkdownFile });

    if (menuItemId === primaryId) return state.primary.action;
    return null;
  }

  // Exports for Node tests.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      getContextMenuState,
      resolveContextMenuAction
    };
  }

  // Globals for extension scripts.
  if (typeof globalThis !== "undefined") {
    globalThis.XCopyMdMenu = {
      getContextMenuState,
      resolveContextMenuAction
    };
  }
})();
