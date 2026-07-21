const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveShortcutAction } = require("./dist/extension/shortcut");

test("resolveShortcutAction: disabled => null", () => {
  assert.equal(
    resolveShortcutAction({
      autoMarkdownCopy: false,
      defaultSaveMarkdownFile: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      key: "c",
      hasSelection: false,
      isEditable: false
    }),
    null
  );
});

test("resolveShortcutAction: default copy => Ctrl/Cmd+C", () => {
  assert.equal(
    resolveShortcutAction({
      autoMarkdownCopy: true,
      defaultSaveMarkdownFile: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      key: "c",
      hasSelection: false,
      isEditable: false
    }),
    "copy"
  );
  assert.equal(
    resolveShortcutAction({
      autoMarkdownCopy: true,
      defaultSaveMarkdownFile: false,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      key: "C",
      hasSelection: false,
      isEditable: false
    }),
    "copy"
  );
  assert.equal(
    resolveShortcutAction({
      autoMarkdownCopy: true,
      defaultSaveMarkdownFile: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      key: "s",
      hasSelection: false,
      isEditable: false
    }),
    null
  );
});

test("resolveShortcutAction: default save => Ctrl/Cmd+S", () => {
  assert.equal(
    resolveShortcutAction({
      autoMarkdownCopy: true,
      defaultSaveMarkdownFile: true,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      key: "s",
      hasSelection: false,
      isEditable: false
    }),
    "save"
  );
  assert.equal(
    resolveShortcutAction({
      autoMarkdownCopy: true,
      defaultSaveMarkdownFile: true,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      key: "S",
      hasSelection: false,
      isEditable: false
    }),
    "save"
  );
  assert.equal(
    resolveShortcutAction({
      autoMarkdownCopy: true,
      defaultSaveMarkdownFile: true,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      key: "c",
      hasSelection: false,
      isEditable: false
    }),
    null
  );
});

test("resolveShortcutAction: ignores alt / selection / editable", () => {
  assert.equal(
    resolveShortcutAction({
      autoMarkdownCopy: true,
      defaultSaveMarkdownFile: false,
      ctrlKey: true,
      metaKey: false,
      altKey: true,
      key: "c",
      hasSelection: false,
      isEditable: false
    }),
    null
  );
  assert.equal(
    resolveShortcutAction({
      autoMarkdownCopy: true,
      defaultSaveMarkdownFile: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      key: "c",
      hasSelection: true,
      isEditable: false
    }),
    null
  );
  // Saving does not depend on selection (Ctrl/Cmd+S is not a "copy selection" gesture).
  assert.equal(
    resolveShortcutAction({
      autoMarkdownCopy: true,
      defaultSaveMarkdownFile: true,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      key: "s",
      hasSelection: true,
      isEditable: false
    }),
    "save"
  );
  assert.equal(
    resolveShortcutAction({
      autoMarkdownCopy: true,
      defaultSaveMarkdownFile: true,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      key: "s",
      hasSelection: false,
      isEditable: true
    }),
    null
  );
});
