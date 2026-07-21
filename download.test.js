const test = require("node:test");
const assert = require("node:assert/strict");

const { waitForDownloadComplete } = require("./dist/extension/download");

test("waitForDownloadComplete: resolves when download completed before the listener observed it", async () => {
  let listener = null;
  let removed = null;

  await waitForDownloadComplete(7, {
    search: async () => [{ id: 7, state: "complete" }],
    addListener: (fn) => {
      listener = fn;
    },
    removeListener: (fn) => {
      removed = fn;
    }
  });

  assert.equal(typeof listener, "function");
  assert.equal(removed, listener);
});

test("waitForDownloadComplete: resolves from an event while the state query is pending", async () => {
  let listener = null;
  let resolveSearch;
  const searchResult = new Promise((resolve) => {
    resolveSearch = resolve;
  });

  const completed = waitForDownloadComplete(8, {
    search: () => searchResult,
    addListener: (fn) => {
      listener = fn;
    },
    removeListener: () => {}
  });

  assert.equal(typeof listener, "function");
  listener({ id: 8, state: { current: "complete" } });
  resolveSearch([{ id: 8, state: "complete" }]);
  await completed;
});

test("waitForDownloadComplete: rejects interrupted downloads found by the state query", async () => {
  await assert.rejects(
    waitForDownloadComplete(9, {
      search: async () => [{ id: 9, state: "interrupted", error: "NETWORK_FAILED" }],
      addListener: () => {},
      removeListener: () => {}
    }),
    /NETWORK_FAILED/
  );
});
