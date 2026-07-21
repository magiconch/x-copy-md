const test = require("node:test");
const assert = require("node:assert/strict");

const { getContextMenuState, resolveContextMenuAction } = require("./dist/extension/menu");

test("getContextMenuState: default is copy primary", () => {
  const s = getContextMenuState({ defaultSaveMarkdownFile: false });
  assert.equal(s.primary.action, "copy");
  assert.equal(s.primary.titleKey, "contextMenu_copyAsMarkdown");
  assert.ok(!("secondary" in s));
});

test("getContextMenuState: when enabled, default is save primary", () => {
  const s = getContextMenuState({ defaultSaveMarkdownFile: true });
  assert.equal(s.primary.action, "save");
  assert.equal(s.primary.titleKey, "contextMenu_saveAsMarkdownFile");
  assert.ok(!("secondary" in s));
});

test("resolveContextMenuAction: chooses action based on setting + clicked menu id", () => {
  const primaryId = "primary";

  assert.equal(
    resolveContextMenuAction({ menuItemId: primaryId, defaultSaveMarkdownFile: false, primaryId }),
    "copy"
  );
  assert.equal(
    resolveContextMenuAction({ menuItemId: primaryId, defaultSaveMarkdownFile: true, primaryId }),
    "save"
  );
});
